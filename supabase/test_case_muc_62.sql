-- Test case bắt buộc (mục 62): Tồn đầu 100kg x 50.000, Nhập 50kg x 60.000,
-- Xuất 20kg → kỳ vọng Giá BQ 53.333,33 | Giá vốn xuất 1.066.666,67 |
-- Tồn 130kg | Giá trị tồn 6.933.333,33. Sau đó kiểm kê thực tế 125kg →
-- phát hiện thiếu 5kg và tạo đề xuất điều chỉnh.

do $$
declare
  v_wh uuid; v_mat uuid; v_user uuid; v_role uuid;
  v_receipt uuid; v_issue uuid; v_stocktake uuid;
  v_bal_qty numeric; v_bal_val numeric;
begin
  select id into v_wh from warehouses where code = 'KHO-KHO';
  select id into v_role from roles where code = 'nhan_vien_kho';
  insert into users(username, password_hash, full_name, role_id)
    values ('test_kho', crypt('123456', gen_salt('bf')), 'Test User', v_role)
    returning id into v_user;
  insert into material_groups(code, name) values ('TEST-GRP','Nhóm test')
    on conflict (code) do nothing;
  insert into materials(material_code, material_name, unit, warehouse_id)
    values ('NVL-TEST-A','NVL A (test mục 62)','kg', v_wh)
    returning id into v_mat;

  -- Tồn đầu 100kg x 50.000 (ghi nhận bằng transaction_type OPENING)
  insert into inventory_transactions(
    warehouse_id, material_id, transaction_type, quantity_in, unit_cost, total_cost,
    balance_quantity, balance_value, average_cost, created_by)
  values (v_wh, v_mat, 'OPENING', 100, 50000, 5000000, 100, 5000000, 50000, v_user);

  -- Nhập 50kg x 60.000 qua phiếu nhập chuẩn (đi qua post_purchase_receipt)
  insert into suppliers(supplier_code, supplier_name) values ('NCC-TEST','NCC Test')
    on conflict (supplier_code) do nothing;
  insert into purchase_receipts(receipt_no, warehouse_id, status)
    values ('PN-TEST-001', v_wh, 'APPROVED') returning id into v_receipt;
  insert into purchase_receipt_details(receipt_id, material_id, quantity, unit_price)
    values (v_receipt, v_mat, 50, 60000);
  perform post_purchase_receipt(v_receipt, v_user);

  select balance_quantity, balance_value into v_bal_qty, v_bal_val
    from inventory_transactions
    where material_id = v_mat and warehouse_id = v_wh
    order by id desc limit 1;
  assert v_bal_qty = 150, 'Sai tồn sau nhập, kỳ vọng 150, thực tế ' || v_bal_qty;
  assert round(v_bal_val/v_bal_qty, 2) = 53333.33, 'Sai giá bình quân, thực tế ' || round(v_bal_val/v_bal_qty,2);

  -- Xuất 20kg thủ công (bắt buộc lý do)
  insert into issue_receipts(issue_no, warehouse_id, issue_source, reason, status)
    values ('PX-TEST-001', v_wh, 'manual', 'Test mục 62', 'APPROVED') returning id into v_issue;
  insert into issue_receipt_details(issue_id, material_id, quantity)
    values (v_issue, v_mat, 20);
  perform post_issue_receipt(v_issue, v_user);

  select balance_quantity, balance_value into v_bal_qty, v_bal_val
    from inventory_transactions
    where material_id = v_mat and warehouse_id = v_wh
    order by id desc limit 1;
  assert v_bal_qty = 130, 'Sai tồn sau xuất, kỳ vọng 130, thực tế ' || v_bal_qty;
  assert round(v_bal_val, 2) = 6933333.33, 'Sai giá trị tồn, kỳ vọng 6.933.333,33, thực tế ' || round(v_bal_val,2);

  raise notice 'PASS: giá BQ=%, giá trị tồn=% (đúng công thức mục 14/46)', round(v_bal_val/v_bal_qty,2), v_bal_val;

  -- Kiểm kê thực tế 125kg → phát hiện thiếu 5kg
  insert into stocktakes(stocktake_no, warehouse_id, status)
    values ('KK-TEST-001', v_wh, 'APPROVED') returning id into v_stocktake;
  insert into stocktake_details(stocktake_id, material_id, book_quantity, actual_quantity, unit_cost)
    values (v_stocktake, v_mat, 130, 125, v_bal_val/v_bal_qty);
  perform create_adjustment_from_stocktake(v_stocktake, v_user);

  if (select count(*) from inventory_adjustments where stocktake_id = v_stocktake and direction='OUT' and quantity=5) = 1
  then raise notice 'PASS: phát hiện thiếu 5kg và tạo đề xuất điều chỉnh giảm.';
  else raise exception 'FAIL: không tạo đúng đề xuất điều chỉnh cho phần thiếu 5kg';
  end if;
end $$;
