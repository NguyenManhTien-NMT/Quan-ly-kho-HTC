-- =====================================================================
-- LOGIC LÕI (mục 63 của prompt): Nhập hàng → Giá vốn NVL (bình quân gia
-- quyền liên hoàn) → Cost món → Xuất NVL → Giá vốn đơn hàng → Lợi nhuận.
-- Toàn bộ nằm ở tầng database (security definer functions) để đảm bảo
-- tồn kho/giá vốn không bao giờ được tính lại "trên giao diện", mà luôn
-- là một hàng ghi sổ (inventory_transactions) bất biến sau khi POSTED.
-- =====================================================================

-- ---------- 1. Đăng nhập (bcrypt, security definer, không lộ hash) ----------
create or replace function authenticate_user(p_username text, p_password text)
returns table (user_id uuid, full_name text, role_code text)
language plpgsql
security definer
as $$
begin
  return query
    select u.id, u.full_name, r.code
    from users u
    join roles r on r.id = u.role_id
    where u.username = p_username
      and u.active
      and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

-- ---------- 2. Lấy tồn kho hiện tại (dòng cuối cùng của sổ kho) ----------
create or replace function get_current_balance(p_material_id uuid, p_warehouse_id uuid)
returns table (balance_quantity numeric, average_cost numeric)
language sql stable
as $$
  -- LEFT JOIN LATERAL đảm bảo LUÔN trả về đúng 1 dòng (0, 0) khi NVL chưa
  -- từng có giao dịch kho nào — nếu chỉ SELECT trực tiếp từ
  -- inventory_transactions mà không khớp dòng nào, SELECT INTO ở nơi gọi sẽ
  -- nhận NULL cho toàn bộ biến (COALESCE không có tác dụng trên 0 dòng).
  select coalesce(t.balance_quantity, 0), coalesce(t.average_cost, 0)
  from (select 1) as _dummy
  left join lateral (
    select balance_quantity, average_cost
    from inventory_transactions
    where material_id = p_material_id and warehouse_id = p_warehouse_id
    order by transaction_date desc, id desc
    limit 1
  ) t on true;
$$;

-- ---------- 3. POST phiếu nhập kho → sinh giao dịch + bình quân gia quyền ----------
create or replace function post_purchase_receipt(p_receipt_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r record;
  d record;
  v_bal_qty numeric; v_bal_val numeric; v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
begin
  select * into r from purchase_receipts where id = p_receipt_id;
  if r.status = 'POSTED' then
    raise exception 'Phiếu đã được ghi sổ trước đó';
  elsif r.status = 'CANCELLED' then
    raise exception 'Phiếu đã bị huỷ, không thể ghi sổ';
  end if;

  for d in select * from purchase_receipt_details where receipt_id = p_receipt_id loop
    select coalesce(balance_quantity,0), coalesce(balance_quantity,0)*coalesce(average_cost,0)
      into v_bal_qty, v_bal_val
      from get_current_balance(d.material_id, r.warehouse_id);

    v_new_qty := v_bal_qty + d.quantity;
    v_new_val := v_bal_val + d.amount;
    v_new_avg := case when v_new_qty > 0 then v_new_val / v_new_qty else 0 end; -- Giá BQ mới = (Tồn trước + Nhập)/(SLtrước+SLnhập)

    insert into inventory_transactions(
      document_date,
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
      r.receipt_date,
      r.warehouse_id, d.material_id, 'PURCHASE', 'purchase_receipt', p_receipt_id,
      d.quantity, 0, d.unit_price, d.amount,
      v_new_qty, v_new_val, v_new_avg, p_user_id);
  end loop;

  update purchase_receipts set status='POSTED', posted_at=now() where id = p_receipt_id;

  insert into audit_logs(user_id, action, table_name, record_id, data_after)
  values (p_user_id, 'post_receipt', 'purchase_receipts', p_receipt_id::text, to_jsonb(r));
end;
$$;

-- ---------- 4. POST phiếu xuất kho (thủ công HOẶC tự sinh từ đơn hàng) ----------
create or replace function post_issue_receipt(p_issue_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  r record; d record;
  v_bal_qty numeric; v_avg numeric; v_new_qty numeric; v_new_val numeric;
begin
  select * into r from issue_receipts where id = p_issue_id;
  if r.status = 'POSTED' then
    raise exception 'Phiếu đã được ghi sổ trước đó';
  elsif r.status = 'CANCELLED' then
    raise exception 'Phiếu đã bị huỷ, không thể ghi sổ';
  end if;
  if r.issue_source = 'manual' and (r.reason is null or r.reason = '') then
    raise exception 'Xuất kho thủ công bắt buộc phải có lý do';
  end if;

  for d in select * from issue_receipt_details where issue_id = p_issue_id loop
    select balance_quantity, average_cost into v_bal_qty, v_avg
      from get_current_balance(d.material_id, r.warehouse_id);

    if v_bal_qty - d.quantity < 0 then
      raise exception 'NVL % (%) không đủ tồn để xuất (tồn %, cần xuất %)',
        (select material_code from materials where id = d.material_id),
        (select material_name from materials where id = d.material_id),
        v_bal_qty, d.quantity;
    end if;

    update issue_receipt_details
      set unit_cost = v_avg, amount = d.quantity * v_avg
      where id = d.id;

    v_new_qty := v_bal_qty - d.quantity;
    v_new_val := v_new_qty * v_avg; -- giá BQ không đổi khi xuất, chỉ đổi khi nhập

    insert into inventory_transactions(
      document_date,
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
      r.issue_date,
      r.warehouse_id, d.material_id, 'ISSUE', 'issue_receipt', p_issue_id,
      0, d.quantity, v_avg, d.quantity * v_avg,
      v_new_qty, v_new_val, v_avg, p_user_id);
  end loop;

  update issue_receipts set status='POSTED', posted_at=now() where id = p_issue_id;

  -- Nếu xuất theo đơn hàng: cộng dồn giá vốn thực tế vào order_details tương ứng.
  -- Bỏ qua các dòng kế toán đã tự ghi đè (cost_overridden = true) — không tự
  -- tính lại đè lên giá trị kế toán đã chốt.
  -- Phân bổ tổng giá vốn NVL đã xuất đều theo tỷ trọng doanh thu từng dòng
  -- (đơn giản hoá cho Phase 1 vì 1 phiếu xuất có thể gộp NVL của nhiều dòng
  -- đơn hàng đã bị trộn theo nguyên liệu; Phase 5 sẽ tách theo từng dòng
  -- ngay từ lúc generate_issue_from_order để không cần phân bổ ước lượng).
  if r.order_id is not null then
    with total_cost as (
      select coalesce(sum(ird.amount), 0) as v
      from issue_receipt_details ird
      join issue_receipts ir on ir.id = ird.issue_id
      where ir.order_id = r.order_id
    ),
    total_rev as (
      select coalesce(sum(revenue), 0) as v from order_details
      where order_id = r.order_id and not cost_overridden
    )
    update order_details od
      set cost = round(case when tr.v > 0 then od.revenue / tr.v * tc.v else 0 end, 2),
          profit = od.revenue - round(case when tr.v > 0 then od.revenue / tr.v * tc.v else 0 end, 2)
      from total_cost tc, total_rev tr
      where od.order_id = r.order_id and not od.cost_overridden;
  end if;

  insert into audit_logs(user_id, action, table_name, record_id, data_after)
  values (p_user_id, 'post_issue', 'issue_receipts', p_issue_id::text, to_jsonb(r));
end;
$$;

-- ---------- 5. Sinh phiếu xuất kho tự động từ đơn hàng theo Cost (mục 16) ----------
create or replace function generate_issue_from_order(p_order_id uuid, p_user_id uuid, p_issue_no text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_issue_id uuid;
  v_warehouse_id uuid;
  d record;
  v_line record;
begin
  select warehouse_id into v_warehouse_id from orders where id = p_order_id;

  insert into issue_receipts(issue_no, warehouse_id, issue_source, order_id, created_by, status)
  values (p_issue_no, v_warehouse_id, 'order', p_order_id, p_user_id, 'DRAFT')
  returning id into v_issue_id;

  for d in
    select od.product_id, od.menu_id, od.quantity, od.item_type
    from order_details od where od.order_id = p_order_id
  loop
    if d.item_type = 'product' and d.product_id is not null then
      for v_line in
        select rd.material_id, rd.quantity * d.quantity as qty_needed
        from recipe_details rd
        where rd.recipe_id = (
          select id from recipes
          where product_id = d.product_id and active
          order by version desc limit 1
        )
      loop
        insert into issue_receipt_details(issue_id, material_id, quantity)
        values (v_issue_id, v_line.material_id, v_line.qty_needed);
      end loop;
    elsif d.item_type = 'menu' and d.menu_id is not null then
      for v_line in
        select rd.material_id, rd.quantity * md.quantity * d.quantity as qty_needed
        from menu_details md
        join recipe_details rd on rd.recipe_id = (
          select id from recipes
          where product_id = md.product_id and active
          order by version desc limit 1
        )
        where md.menu_id = d.menu_id
      loop
        insert into issue_receipt_details(issue_id, material_id, quantity)
        values (v_issue_id, v_line.material_id, v_line.qty_needed);
      end loop;
    end if;
  end loop;

  return v_issue_id;
end;
$$;

-- ---------- 6. Cost lý thuyết của 1 món tại thời điểm hiện tại ----------
create or replace function compute_theoretical_cost(p_product_id uuid, p_warehouse_id uuid)
returns numeric
language sql stable
as $$
  with latest_recipe as (
    select id from recipes
    where product_id = p_product_id and active
    order by version desc
    limit 1
  )
  select coalesce(sum(rd.quantity * b.average_cost), 0)
  from latest_recipe r
  join recipe_details rd on rd.recipe_id = r.id
  join lateral get_current_balance(rd.material_id, p_warehouse_id) b on true;
$$;

-- ---------- 9. HUỶ PHIẾU NHẬP ĐÃ GHI SỔ (hoàn tác kho khi phát hiện sai sót) ----------
-- Chỉ hoàn tác được nếu giao dịch của phiếu này là giao dịch MỚI NHẤT của
-- từng NVL trong kho đó (đảm bảo không phá vỡ thứ tự bình quân gia quyền
-- liên hoàn nếu đã có nhập/xuất khác xảy ra sau đó cho cùng NVL).
create or replace function cancel_purchase_receipt(p_receipt_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
as $$
declare
  r record; d record;
  v_latest_txn_id bigint;
  v_bal_qty numeric; v_bal_val numeric; v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
begin
  select * into r from purchase_receipts where id = p_receipt_id;
  if r is null then raise exception 'Không tìm thấy phiếu %', p_receipt_id; end if;
  if r.status <> 'POSTED' then
    raise exception 'Chỉ huỷ được phiếu đã ghi sổ (POSTED)';
  end if;

  for d in select * from purchase_receipt_details where receipt_id = p_receipt_id loop
    select t.id into v_latest_txn_id
      from inventory_transactions t
      where t.material_id = d.material_id and t.warehouse_id = r.warehouse_id
      order by t.transaction_date desc, t.id desc
      limit 1;

    if not exists (
      select 1 from inventory_transactions
      where id = v_latest_txn_id
        and reference_type = 'purchase_receipt'
        and reference_id = p_receipt_id
    ) then
      raise exception 'Không thể huỷ: NVL % đã có giao dịch nhập/xuất mới hơn sau phiếu này. Cần điều chỉnh thủ công qua Kiểm kê thay vì huỷ phiếu.', d.material_id;
    end if;
  end loop;

  for d in select * from purchase_receipt_details where receipt_id = p_receipt_id loop
    select coalesce(balance_quantity,0), coalesce(balance_quantity,0)*coalesce(average_cost,0)
      into v_bal_qty, v_bal_val
      from get_current_balance(d.material_id, r.warehouse_id);

    v_new_qty := v_bal_qty - d.quantity;
    v_new_val := v_bal_val - d.amount;
    v_new_avg := case when v_new_qty > 0 then v_new_val / v_new_qty else 0 end;

    insert into inventory_transactions(
      document_date,
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
      current_date,
      r.warehouse_id, d.material_id, 'ADJUSTMENT_OUT', 'purchase_receipt_cancel', p_receipt_id,
      0, d.quantity, d.unit_price, d.amount,
      v_new_qty, v_new_val, v_new_avg, p_user_id);
  end loop;

  update purchase_receipts set status = 'CANCELLED' where id = p_receipt_id;

  insert into audit_logs(user_id, action, table_name, record_id, data_before, data_after)
  values (p_user_id, 'cancel_purchase_receipt', 'purchase_receipts', p_receipt_id::text,
          to_jsonb(r), jsonb_build_object('reason', p_reason));
end;
$$;

-- ---------- 9b. HUỶ PHIẾU XUẤT KHO ĐÃ GHI SỔ (dùng khi huỷ đơn hàng) ----------
create or replace function cancel_issue_receipt(p_issue_id uuid, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
as $$
declare
  r record; d record;
  v_latest_txn_id bigint;
  v_bal_qty numeric; v_bal_val numeric; v_new_qty numeric; v_new_val numeric; v_new_avg numeric;
begin
  select * into r from issue_receipts where id = p_issue_id;
  if r is null then raise exception 'Không tìm thấy phiếu xuất %', p_issue_id; end if;
  if r.status <> 'POSTED' then
    raise exception 'Chỉ huỷ được phiếu đã ghi sổ (POSTED)';
  end if;

  for d in select * from issue_receipt_details where issue_id = p_issue_id loop
    select t.id into v_latest_txn_id
      from inventory_transactions t
      where t.material_id = d.material_id and t.warehouse_id = r.warehouse_id
      order by t.transaction_date desc, t.id desc
      limit 1;

    if not exists (
      select 1 from inventory_transactions
      where id = v_latest_txn_id
        and reference_type = 'issue_receipt'
        and reference_id = p_issue_id
    ) then
      raise exception 'Không thể huỷ: NVL % đã có giao dịch nhập/xuất mới hơn sau phiếu này. Cần điều chỉnh thủ công qua Kiểm kê thay vì huỷ.', d.material_id;
    end if;
  end loop;

  for d in select * from issue_receipt_details where issue_id = p_issue_id loop
    select coalesce(balance_quantity,0), coalesce(balance_quantity,0)*coalesce(average_cost,0)
      into v_bal_qty, v_bal_val
      from get_current_balance(d.material_id, r.warehouse_id);

    -- Trả lại đúng số lượng đã xuất, giữ nguyên giá bình quân hiện tại (xuất
    -- kho không làm thay đổi giá BQ nên hoàn tác cũng vậy — chỉ cộng lại SL)
    v_new_qty := v_bal_qty + d.quantity;
    v_new_avg := coalesce((select average_cost from get_current_balance(d.material_id, r.warehouse_id)), 0);
    v_new_val := v_new_qty * v_new_avg;

    insert into inventory_transactions(
      document_date,
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
      current_date,
      r.warehouse_id, d.material_id, 'ADJUSTMENT_IN', 'issue_receipt_cancel', p_issue_id,
      d.quantity, 0, v_new_avg, d.quantity * v_new_avg,
      v_new_qty, v_new_val, v_new_avg, p_user_id);
  end loop;

  update issue_receipts set status = 'CANCELLED' where id = p_issue_id;

  if r.order_id is not null then
    update orders set status = 'CANCELLED', cancelled_at = now(), cancel_reason = p_reason where id = r.order_id;
  end if;

  insert into audit_logs(user_id, action, table_name, record_id, data_before, data_after)
  values (p_user_id, 'cancel_issue_receipt', 'issue_receipts', p_issue_id::text,
          to_jsonb(r), jsonb_build_object('reason', p_reason));
end;
$$;

-- ---------- 10. LƯU CÔNG THỨC MÓN ĂN (tạo version mới, giữ lịch sử — mục 41) ----------
-- p_lines: jsonb dạng [{"material_id": "...", "quantity": 1.2}, ...]
create or replace function save_recipe(p_product_id uuid, p_cost_mode text, p_lines jsonb, p_user_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_next_version int;
  v_recipe_id uuid;
  v_line jsonb;
begin
  select coalesce(max(version), 0) + 1 into v_next_version from recipes where product_id = p_product_id;

  update recipes set active = false, effective_to = current_date
    where product_id = p_product_id and active;

  insert into recipes(product_id, version, cost_mode, active, created_by)
  values (p_product_id, v_next_version, p_cost_mode, true, p_user_id)
  returning id into v_recipe_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into recipe_details(recipe_id, material_id, quantity)
    values (v_recipe_id, (v_line->>'material_id')::uuid, (v_line->>'quantity')::numeric);
  end loop;

  insert into audit_logs(user_id, action, table_name, record_id, data_after)
  values (p_user_id, 'save_recipe', 'recipes', v_recipe_id::text, jsonb_build_object('product_id', p_product_id, 'version', v_next_version));

  return v_recipe_id;
end;
$$;

-- ---------- 11. GHI LỊCH SỬ COST THỰC TẾ THEO TỪNG LẦN XUẤT (yêu cầu bổ sung) ----------
-- Sau khi post_issue_receipt đã tính cost/profit cho order_details, hàm này
-- ghi lại cost thực tế/suất vào cost_history cho từng món trong đơn, và
-- chuyển đơn hàng sang POSTED. Cost lý thuyết (compute_theoretical_cost) và
-- cost thực tế (bảng này) tồn tại song song để đối chiếu — đúng mục 40.
create or replace function finalize_product_issue(p_order_id uuid, p_issue_no text, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare v_od record; v_recipe_id uuid;
begin
  for v_od in select * from order_details where order_id = p_order_id and item_type = 'product' loop
    select id into v_recipe_id from recipes where product_id = v_od.product_id and active order by version desc limit 1;
    insert into cost_history(product_id, recipe_id, cost_theoretical, note)
    values (
      v_od.product_id, v_recipe_id,
      case when v_od.quantity > 0 then coalesce(v_od.cost, 0) / v_od.quantity else 0 end,
      'Cost thực tế/suất từ phiếu xuất ' || p_issue_no
    );
  end loop;

  update orders set status = 'POSTED', posted_at = now() where id = p_order_id;
end;
$$;

-- ---------- 12. BÁO CÁO XUẤT - NHẬP - TỒN theo kỳ (đầy đủ SL, đơn giá, thành tiền) ----------
-- LƯU Ý QUAN TRỌNG: báo cáo này CỘNG DỒN trực tiếp SL/giá trị theo
-- document_date (ngày chứng từ), KHÔNG dùng cột balance_quantity/balance_value
-- đã lưu sẵn trong sổ kho — vì các cột đó phản ánh đúng thứ tự GHI SỔ THỰC TẾ
-- (transaction_date), có thể khác thứ tự ngày chứng từ nếu bạn ghi sổ không
-- đúng trình tự thời gian (vd: ghi sổ phiếu nhập ngày 20/1 trước rồi mới ghi
-- phiếu xuất ngày 10/1). Cộng dồn trực tiếp luôn cho ra đúng SL bất kể thứ tự
-- ghi sổ; giá trị có thể lệch nhẹ nếu ghi sổ rất lộn xộn so với ngày chứng từ
-- (trường hợp hiếm, khuyến nghị luôn ghi sổ theo đúng thứ tự thời gian).
create or replace function report_xnt(p_warehouse_id uuid, p_from_date date, p_to_date date)
returns table (
  material_id uuid, material_code text, material_name text, unit text,
  opening_qty numeric, opening_value numeric,
  in_qty numeric, in_value numeric,
  out_qty numeric, out_value numeric,
  closing_qty numeric, closing_value numeric
)
language sql stable
as $$
  with mats as (
    select distinct material_id from inventory_transactions where warehouse_id = p_warehouse_id
  ),
  before as (
    select material_id,
      sum(quantity_in) - sum(quantity_out) as qty,
      sum(quantity_in * coalesce(unit_cost,0)) - sum(quantity_out * coalesce(unit_cost,0)) as val
    from inventory_transactions
    where warehouse_id = p_warehouse_id
      and coalesce(document_date, transaction_date::date) < p_from_date
    group by material_id
  ),
  period as (
    select material_id,
      sum(quantity_in) as in_qty,
      sum(quantity_in * coalesce(unit_cost,0)) as in_value,
      sum(quantity_out) as out_qty,
      sum(quantity_out * coalesce(unit_cost,0)) as out_value
    from inventory_transactions
    where warehouse_id = p_warehouse_id
      and coalesce(document_date, transaction_date::date) >= p_from_date
      and coalesce(document_date, transaction_date::date) < (p_to_date + 1)
    group by material_id
  )
  select
    m.material_id, mt.material_code, mt.material_name, mt.unit,
    coalesce(b.qty,0), coalesce(b.val,0),
    coalesce(p.in_qty,0), coalesce(p.in_value,0),
    coalesce(p.out_qty,0), coalesce(p.out_value,0),
    coalesce(b.qty,0) + coalesce(p.in_qty,0) - coalesce(p.out_qty,0),
    coalesce(b.val,0) + coalesce(p.in_value,0) - coalesce(p.out_value,0)
  from mats m
  join materials mt on mt.id = m.material_id
  left join before b on b.material_id = m.material_id
  left join period p on p.material_id = m.material_id
  order by mt.material_code;
$$;

-- ---------- 13. BÁO CÁO DOANH THU theo Loại hình doanh thu ----------
create or replace function report_revenue_by_type(p_from_date date, p_to_date date)
returns table (revenue_type_id uuid, revenue_type_name text, total_revenue numeric, total_cost numeric, total_profit numeric, order_count bigint)
language sql stable
as $$
  select rt.id, rt.name,
    coalesce(sum(od.revenue),0),
    coalesce(sum(od.cost),0),
    coalesce(sum(od.revenue),0) - coalesce(sum(od.cost),0),
    count(distinct o.id)
  from revenue_types rt
  left join orders o on o.revenue_type_id = rt.id
    and o.order_date >= p_from_date and o.order_date < (p_to_date + 1)
    and o.status <> 'CANCELLED'
  left join order_details od on od.order_id = o.id
  group by rt.id, rt.name
  order by rt.name;
$$;

-- ---------- 14. BÁO CÁO DOANH THU theo Nguồn (Nhân viên kinh doanh / Mã xuất) ----------
create or replace function report_revenue_by_salesperson(p_from_date date, p_to_date date)
returns table (salesperson_id uuid, salesperson_name text, total_revenue numeric, total_cost numeric, total_profit numeric, order_count bigint)
language sql stable
as $$
  select sp.id, sp.full_name,
    coalesce(sum(od.revenue),0),
    coalesce(sum(od.cost),0),
    coalesce(sum(od.revenue),0) - coalesce(sum(od.cost),0),
    count(distinct o.id)
  from salespersons sp
  left join orders o on o.salesperson_id = sp.id
    and o.order_date >= p_from_date and o.order_date < (p_to_date + 1)
    and o.status <> 'CANCELLED'
  left join order_details od on od.order_id = o.id
  group by sp.id, sp.full_name
  order by sp.full_name;
$$;

-- ---------- 8. KẾ TOÁN GHI ĐÈ GIÁ VỐN/COST MÓN THỦ CÔNG (có audit log) ----------

-- 8.1. Ghi đè giá vốn của MỘT DÒNG trong một đơn hàng cụ thể
create or replace function override_order_detail_cost(p_order_detail_id uuid, p_new_cost numeric, p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
as $$
declare v_before record;
begin
  select * into v_before from order_details where id = p_order_detail_id;
  if v_before is null then raise exception 'Không tìm thấy dòng đơn hàng %', p_order_detail_id; end if;

  update order_details
    set cost = p_new_cost,
        profit = revenue - p_new_cost,
        cost_overridden = true,
        cost_updated_by = p_user_id,
        cost_updated_at = now()
    where id = p_order_detail_id;

  insert into audit_logs(user_id, action, table_name, record_id, data_before, data_after)
  values (p_user_id, 'override_order_detail_cost', 'order_details', p_order_detail_id::text,
          to_jsonb(v_before), jsonb_build_object('cost', p_new_cost, 'reason', p_reason));
end;
$$;

-- 8.2. Hoàn tác ghi đè → cho hệ thống tự tính lại theo giá vốn NVL thực tế
create or replace function reset_order_detail_cost(p_order_detail_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update order_details
    set cost_overridden = false, cost_updated_by = p_user_id, cost_updated_at = now()
    where id = p_order_detail_id;
  insert into audit_logs(user_id, action, table_name, record_id)
  values (p_user_id, 'reset_order_detail_cost', 'order_details', p_order_detail_id::text);
end;
$$;

-- 8.3. Kế toán sửa định mức cost món ở mức công thức (áp dụng cho MỌI đơn hàng
-- dùng món này từ giờ trở đi) — chỉ áp dụng khi cost_mode = 'phan_bo'
create or replace function update_recipe_allocated_cost(p_recipe_detail_id uuid, p_new_allocated_cost numeric, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare v_before record;
begin
  select * into v_before from recipe_details where id = p_recipe_detail_id;
  if v_before is null then raise exception 'Không tìm thấy dòng công thức %', p_recipe_detail_id; end if;

  update recipe_details set allocated_cost = p_new_allocated_cost where id = p_recipe_detail_id;

  insert into audit_logs(user_id, action, table_name, record_id, data_before, data_after)
  values (p_user_id, 'update_recipe_allocated_cost', 'recipe_details', p_recipe_detail_id::text,
          to_jsonb(v_before), jsonb_build_object('allocated_cost', p_new_allocated_cost));
end;
$$;

-- ---------- 7. Kiểm kê → tạo biên bản điều chỉnh VÀ ghi thẳng vào sổ kho ----------
-- Theo đúng yêu cầu: kiểm kê xong bấm 1 nút là kho tự điều chỉnh luôn, đồng
-- thời vẫn lưu lại đầy đủ biên bản điều chỉnh (inventory_adjustments) để
-- truy vết sau này — không phải chỉ tạo đề xuất chờ duyệt riêng.
create or replace function finalize_stocktake(p_stocktake_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  d record; v_wh uuid; v_no text; v_direction text; v_date date;
  v_bal_qty numeric; v_new_qty numeric; v_new_avg numeric; v_new_val numeric;
begin
  select warehouse_id, stocktake_date into v_wh, v_date from stocktakes where id = p_stocktake_id;
  if v_wh is null then raise exception 'Không tìm thấy phiếu kiểm kê %', p_stocktake_id; end if;

  for d in select * from stocktake_details where stocktake_id = p_stocktake_id and variance_quantity <> 0 loop
    select coalesce(balance_quantity,0) into v_bal_qty from get_current_balance(d.material_id, v_wh);
    v_new_avg := coalesce((select average_cost from get_current_balance(d.material_id, v_wh)), 0);
    v_direction := case when d.variance_quantity > 0 then 'IN' else 'OUT' end;
    v_new_qty := v_bal_qty + d.variance_quantity;
    v_new_val := v_new_qty * v_new_avg;

    v_no := 'ADJ-' || to_char(now(),'YYYYMMDD') || '-' || substr(d.id::text,1,8);
    insert into inventory_adjustments(
      adjustment_no, stocktake_id, warehouse_id, material_id, direction,
      quantity, unit_cost, value, reason, created_by, approved_by, status)
    values (
      v_no, p_stocktake_id, v_wh, d.material_id, v_direction,
      abs(d.variance_quantity), v_new_avg, abs(d.variance_quantity) * v_new_avg,
      'Chênh lệch kiểm kê ' || p_stocktake_id, p_user_id, p_user_id, 'POSTED');

    insert into inventory_transactions(
      document_date,
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
      v_date,
      v_wh, d.material_id,
      (case when v_direction = 'IN' then 'ADJUSTMENT_IN' else 'ADJUSTMENT_OUT' end)::inventory_txn_type,
      'stocktake', p_stocktake_id,
      case when v_direction = 'IN' then abs(d.variance_quantity) else 0 end,
      case when v_direction = 'OUT' then abs(d.variance_quantity) else 0 end,
      v_new_avg, abs(d.variance_quantity) * v_new_avg,
      v_new_qty, v_new_val, v_new_avg, p_user_id);
  end loop;

  update stocktakes set status = 'POSTED' where id = p_stocktake_id;

  insert into audit_logs(user_id, action, table_name, record_id)
  values (p_user_id, 'finalize_stocktake', 'stocktakes', p_stocktake_id::text);
end;
$$;
