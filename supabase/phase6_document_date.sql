-- Thêm cột document_date (ngày trên chứng từ) tách biệt với transaction_date
-- (thời điểm ghi sổ thực tế, quyết định thứ tự bình quân gia quyền).
-- Cần thiết để báo cáo Xuất-Nhập-Tồn theo kỳ lọc đúng theo NGÀY CHỨNG TỪ,
-- không bị lẫn theo ngày bấm nút Ghi sổ.

alter table inventory_transactions add column if not exists document_date date;

-- Với các giao dịch cũ đã có trước khi thêm cột này, tạm gán document_date
-- = ngày của transaction_date để không bị NULL (chỉ ảnh hưởng độ chính xác
-- báo cáo của dữ liệu cũ, không ảnh hưởng tồn kho/giá vốn hiện tại).
update inventory_transactions set document_date = transaction_date::date where document_date is null;

create index if not exists idx_inv_txn_document_date on inventory_transactions(warehouse_id, document_date);
