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
  select coalesce(t.balance_quantity, 0), coalesce(t.average_cost, 0)
  from inventory_transactions t
  where t.material_id = p_material_id and t.warehouse_id = p_warehouse_id
  order by t.transaction_date desc, t.id desc
  limit 1;
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
  if r.status <> 'APPROVED' then
    raise exception 'Phiếu nhập phải ở trạng thái APPROVED trước khi POSTED';
  end if;

  for d in select * from purchase_receipt_details where receipt_id = p_receipt_id loop
    select coalesce(balance_quantity,0), coalesce(balance_quantity,0)*coalesce(average_cost,0)
      into v_bal_qty, v_bal_val
      from get_current_balance(d.material_id, r.warehouse_id);

    v_new_qty := v_bal_qty + d.quantity;
    v_new_val := v_bal_val + d.amount;
    v_new_avg := case when v_new_qty > 0 then v_new_val / v_new_qty else 0 end; -- Giá BQ mới = (Tồn trước + Nhập)/(SLtrước+SLnhập)

    insert into inventory_transactions(
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
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
  if r.status <> 'APPROVED' then
    raise exception 'Phiếu xuất phải ở trạng thái APPROVED trước khi POSTED';
  end if;
  if r.issue_source = 'manual' and (r.reason is null or r.reason = '') then
    raise exception 'Xuất kho thủ công bắt buộc phải có lý do';
  end if;

  for d in select * from issue_receipt_details where issue_id = p_issue_id loop
    select balance_quantity, average_cost into v_bal_qty, v_avg
      from get_current_balance(d.material_id, r.warehouse_id);

    if v_bal_qty - d.quantity < 0 then
      raise exception 'NVL % không đủ tồn để xuất (tồn %, cần xuất %)', d.material_id, v_bal_qty, d.quantity;
    end if;

    update issue_receipt_details
      set unit_cost = v_avg, amount = d.quantity * v_avg
      where id = d.id;

    v_new_qty := v_bal_qty - d.quantity;
    v_new_val := v_new_qty * v_avg; -- giá BQ không đổi khi xuất, chỉ đổi khi nhập

    insert into inventory_transactions(
      warehouse_id, material_id, transaction_type, reference_type, reference_id,
      quantity_in, quantity_out, unit_cost, total_cost,
      balance_quantity, balance_value, average_cost, created_by)
    values (
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

-- ---------- 7. Kiểm kê → tạo đề xuất điều chỉnh (mục 20, 47) ----------
create or replace function create_adjustment_from_stocktake(p_stocktake_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare d record; v_no text;
begin
  for d in select * from stocktake_details where stocktake_id = p_stocktake_id and variance_quantity <> 0 loop
    v_no := 'ADJ-' || to_char(now(),'YYYYMMDD') || '-' || substr(d.id::text,1,8);
    insert into inventory_adjustments(
      adjustment_no, stocktake_id, warehouse_id, material_id, direction,
      quantity, unit_cost, value, reason, created_by, status)
    select v_no, p_stocktake_id, s.warehouse_id, d.material_id,
           case when d.variance_quantity > 0 then 'IN' else 'OUT' end,
           abs(d.variance_quantity), d.unit_cost, abs(d.variance_quantity)*d.unit_cost,
           'Chênh lệch kiểm kê ' || p_stocktake_id, p_user_id, 'SUBMITTED'
    from stocktakes s where s.id = p_stocktake_id;
  end loop;
end;
$$;
