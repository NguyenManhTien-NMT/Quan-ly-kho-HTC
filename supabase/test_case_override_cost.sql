-- Test case: kế toán tự ghi đè/hoàn tác giá vốn của một dòng đơn hàng.
-- Tự chứa hoàn toàn (không phụ thuộc dữ liệu của file test khác) — chỉ cần
-- đã chạy schema.sql và functions.sql trước đó.

do $$
declare
  v_wh uuid; v_user uuid; v_role uuid; v_prod uuid;
  v_order uuid; v_detail_id uuid;
begin
  select id into v_wh from warehouses where code = 'KHO-KHO';

  select id into v_user from users where username = 'test_override_kt';
  if v_user is null then
    select id into v_role from roles where code = 'ke_toan';
    insert into users(username, password_hash, full_name, role_id)
      values ('test_override_kt', crypt('123456', gen_salt('bf')), 'Test Ke Toan', v_role)
      returning id into v_user;
  end if;

  insert into products(product_code, product_name, unit, selling_price)
    values ('MON-TEST-OVERRIDE', 'Món test override', 'suất', 150000)
    returning id into v_prod;

  insert into orders(order_code, warehouse_id, status, revenue)
    values ('DH-TEST-OVERRIDE', v_wh, 'APPROVED', 1500000)
    returning id into v_order;

  insert into order_details(order_id, item_type, product_id, quantity, selling_price, revenue, cost, profit)
    values (v_order, 'product', v_prod, 10, 150000, 1500000, 650000, 850000)
    returning id into v_detail_id;

  perform override_order_detail_cost(v_detail_id, 700000, v_user, 'Kế toán điều chỉnh theo thực tế bếp báo');

  if (select cost from order_details where id = v_detail_id) = 700000
     and (select profit from order_details where id = v_detail_id) = 800000
     and (select cost_overridden from order_details where id = v_detail_id) = true
  then raise notice 'PASS: ghi đè giá vốn thành công, cost=700000, profit=800000, cost_overridden=true';
  else raise exception 'FAIL: ghi đè giá vốn không đúng';
  end if;

  if (select count(*) from audit_logs where table_name = 'order_details' and action = 'override_order_detail_cost' and record_id = v_detail_id::text) = 1
  then raise notice 'PASS: đã ghi audit log cho hành động ghi đè';
  else raise exception 'FAIL: thiếu audit log';
  end if;

  perform reset_order_detail_cost(v_detail_id, v_user);
  if (select cost_overridden from order_details where id = v_detail_id) = false
  then raise notice 'PASS: hoàn tác về chế độ tự động thành công';
  else raise exception 'FAIL: hoàn tác không thành công';
  end if;

  raise notice 'Xong. Dữ liệu test (đơn DH-TEST-OVERRIDE, món MON-TEST-OVERRIDE) có thể xoá thủ công nếu muốn dọn dẹp.';
end $$;
