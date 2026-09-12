-- =====================================================================
-- WEB APP QUẢN LÝ KHO – COST MÓN – GIÁ VỐN – DOANH THU NHÀ HÀNG
-- Schema Postgres (Supabase). Thiết kế theo đúng mục 45 (data model tối
-- thiểu) + mục 46 (công thức) + mục 52 (trạng thái chứng từ) của prompt.
-- KHÔNG rút gọn bảng, KHÔNG rút gọn nghiệp vụ.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ============================ 0. HỆ THỐNG ============================

create table roles (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null, -- admin, quan_ly, nhan_vien_kho, nhan_vien_kinh_doanh, ke_toan, bep
  name          text not null,
  created_at    timestamptz not null default now()
);

create table permissions (
  id            uuid primary key default gen_random_uuid(),
  role_id       uuid not null references roles(id) on delete cascade,
  resource      text not null,   -- vd: 'materials', 'orders', 'cost'
  action        text not null,   -- vd: 'view','create','edit','approve','delete'
  unique (role_id, resource, action)
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  username      text unique not null,
  password_hash text not null,       -- bcrypt, xác thực qua RPC security definer
  full_name     text not null,
  role_id       uuid not null references roles(id),
  phone         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table audit_logs (
  id            bigint generated always as identity primary key,
  user_id       uuid references users(id),
  action        text not null,           -- 'update_cost','post_receipt','adjust_stock',...
  table_name    text not null,
  record_id     text,
  data_before   jsonb,
  data_after    jsonb,
  ip_address    text,
  created_at    timestamptz not null default now()
);

-- ============================ 1. KHO / DANH MỤC ============================

create table warehouses (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  warehouse_type text not null default 'khac', -- kho_uot, kho_kho, kho_do_uong, kho_thanh_pham, khac
  active        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now()
);

create table material_groups (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,
  name          text not null,
  parent_group_id uuid references material_groups(id), -- hỗ trợ "mã nhóm lớn"
  active        boolean not null default true
);

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  supplier_code text unique not null,
  supplier_name text not null,
  phone         text,
  address       text,
  tax_code      text,
  payment_type  text not null default 'tien_mat', -- tien_mat, cong_no, noi_bo, nhap_bat_thuong, kho_che_bien, nhap_tu_don_vi_khac
  active        boolean not null default true,
  note          text,
  created_at    timestamptz not null default now()
);

create table materials (
  id              uuid primary key default gen_random_uuid(),
  material_code   text unique not null,
  material_name   text not null,
  unit            text not null,
  material_group_id uuid references material_groups(id),
  material_type   text not null default 'nvl_thuc_pham', -- nvl_thuc_pham, do_uong, bao_bi, ccdc, hang_hoa, nvl_khac
  warehouse_id    uuid references warehouses(id),
  minimum_stock   numeric(14,3) default 0,
  maximum_stock   numeric(14,3),
  active          boolean not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_materials_group on materials(material_group_id);
create index idx_materials_warehouse on materials(warehouse_id);

create table product_groups (
  id     uuid primary key default gen_random_uuid(),
  code   text unique not null,
  name   text not null,
  active boolean not null default true
);

create table products ( -- món ăn / thành phẩm
  id             uuid primary key default gen_random_uuid(),
  product_code   text unique not null,
  product_name   text not null,
  unit           text not null,
  product_group_id uuid references product_groups(id),
  selling_price  numeric(14,2) not null default 0,
  active         boolean not null default true,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_products_group on products(product_group_id);

create table revenue_types ( -- loại doanh thu: hội trường, phòng vip, bar,...
  id     uuid primary key default gen_random_uuid(),
  code   text unique not null,
  name   text not null,
  active boolean not null default true
);

create table salespersons (
  id         uuid primary key default gen_random_uuid(),
  emp_code   text unique not null,
  full_name  text not null,
  department text,
  position   text,
  phone      text,
  active     boolean not null default true
);

create table customers (
  id               uuid primary key default gen_random_uuid(),
  customer_code    text unique not null,
  customer_name    text not null,
  phone            text,
  address          text,
  tax_code         text,
  customer_type    text,
  customer_group   text,
  salesperson_id   uuid references salespersons(id),
  note             text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ============================ 2. COST MÓN / MÂM ============================

-- Mỗi thay đổi định mức tạo 1 version mới (mục 41: lịch sử cost, không ghi đè)
create table recipes (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id),
  version       int not null default 1,
  effective_from date not null default current_date,
  effective_to   date, -- null = đang áp dụng
  cost_mode     text not null default 'dinh_muc', -- dinh_muc (theo NVL+giá BQ) | phan_bo (allocated_cost cố định từng dòng)
  active        boolean not null default true,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (product_id, version)
);
create index idx_recipes_product on recipes(product_id, active);

create table recipe_details (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes(id) on delete cascade,
  material_id   uuid not null references materials(id),
  quantity      numeric(14,4) not null, -- định lượng cho 1 suất
  allocated_cost numeric(14,2),         -- dùng khi cost_mode = 'phan_bo'
  note          text
);
create index idx_recipe_details_recipe on recipe_details(recipe_id);

-- Lưu lịch sử cost đã "chốt" tại từng thời điểm (mục 41)
create table cost_history (
  id            bigint generated always as identity primary key,
  product_id    uuid not null references products(id),
  recipe_id     uuid references recipes(id),
  cost_theoretical numeric(14,2) not null, -- cost lý thuyết tại thời điểm này
  computed_at   timestamptz not null default now(),
  note          text
);
create index idx_cost_history_product on cost_history(product_id, computed_at desc);

create table menus ( -- mâm / combo / set menu
  id            uuid primary key default gen_random_uuid(),
  menu_code     text unique not null,
  menu_name     text not null,
  selling_price numeric(14,2) not null default 0,
  standard_guests int default 10,
  active        boolean not null default true,
  note          text
);

create table menu_details (
  id            uuid primary key default gen_random_uuid(),
  menu_id       uuid not null references menus(id) on delete cascade,
  product_id    uuid not null references products(id),
  quantity      numeric(14,3) not null default 1
);
create index idx_menu_details_menu on menu_details(menu_id);

-- ============================ 3. ĐƠN HÀNG / DOANH THU ============================

create table orders (
  id              uuid primary key default gen_random_uuid(),
  order_code      text unique not null,
  order_date      date not null default current_date,
  customer_id     uuid references customers(id),
  salesperson_id  uuid references salespersons(id),
  revenue_type_id uuid references revenue_types(id),
  delivery_type   text,
  warehouse_id    uuid references warehouses(id),
  status          text not null default 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, POSTED, CANCELLED
  revenue         numeric(14,2) not null default 0,
  note            text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  posted_at       timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text
);
create index idx_orders_date on orders(order_date);
create index idx_orders_status on orders(status);
create index idx_orders_salesperson on orders(salesperson_id);
create index idx_orders_revenue_type on orders(revenue_type_id);

create table order_details (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  item_type       text not null,   -- 'product' | 'menu'
  product_id      uuid references products(id),
  menu_id         uuid references menus(id),
  quantity        numeric(14,3) not null,
  selling_price   numeric(14,2) not null,
  discount        numeric(14,2) not null default 0,
  revenue         numeric(14,2) not null default 0, -- qty*price - discount
  cost            numeric(14,2), -- điền sau khi tính cost thực tế (hoặc do kế toán ghi đè)
  profit          numeric(14,2),
  cost_overridden boolean not null default false, -- true = kế toán đã tự sửa, hệ thống không tự tính lại đè lên nữa
  cost_updated_by uuid references users(id),
  cost_updated_at timestamptz
);
create index idx_order_details_order on order_details(order_id);

-- ============================ 4. NHẬP KHO ============================

create table purchase_receipts (
  id            uuid primary key default gen_random_uuid(),
  receipt_no    text unique not null,
  receipt_date  date not null default current_date,
  supplier_id   uuid references suppliers(id),
  receipt_type  text not null default 'tien_mat', -- kế thừa payment_type của supplier, có thể override
  warehouse_id  uuid not null references warehouses(id),
  created_by    uuid references users(id),
  payment_type  text,
  status        text not null default 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, POSTED, CANCELLED
  note          text,
  created_at    timestamptz not null default now(),
  posted_at     timestamptz
);
create index idx_purchase_receipts_date on purchase_receipts(receipt_date);
create index idx_purchase_receipts_status on purchase_receipts(status);

create table purchase_receipt_details (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null references purchase_receipts(id) on delete cascade,
  material_id   uuid not null references materials(id),
  quantity      numeric(14,3) not null,
  unit_price    numeric(14,2) not null,
  amount        numeric(14,2) generated always as (quantity * unit_price) stored
);
create index idx_prd_receipt on purchase_receipt_details(receipt_id);

-- ============================ 5. XUẤT KHO ============================

create table issue_receipts (
  id            uuid primary key default gen_random_uuid(),
  issue_no      text unique not null,
  issue_date    date not null default current_date,
  warehouse_id  uuid not null references warehouses(id),
  issue_source  text not null default 'order', -- 'order' (tự sinh từ đơn hàng) | 'manual'
  order_id      uuid references orders(id),
  reason        text,   -- bắt buộc khi issue_source = 'manual' (hao hụt, hỏng, biếu tặng,...)
  created_by    uuid references users(id),
  status        text not null default 'DRAFT',
  note          text,
  created_at    timestamptz not null default now(),
  posted_at     timestamptz
);
create index idx_issue_receipts_date on issue_receipts(issue_date);
create index idx_issue_receipts_order on issue_receipts(order_id);

create table issue_receipt_details (
  id            uuid primary key default gen_random_uuid(),
  issue_id      uuid not null references issue_receipts(id) on delete cascade,
  material_id   uuid not null references materials(id),
  quantity      numeric(14,3) not null,
  unit_cost     numeric(14,4), -- giá vốn bình quân tại thời điểm xuất (điền khi POSTED)
  amount        numeric(14,2)
);
create index idx_ird_issue on issue_receipt_details(issue_id);

-- ============================ 6. SỔ KHO (NGUỒN SỰ THẬT DUY NHẤT) ============================

create type inventory_txn_type as enum (
  'OPENING','PURCHASE','ISSUE','RETURN_IN','RETURN_OUT',
  'ADJUSTMENT_IN','ADJUSTMENT_OUT','STOCKTAKE','TRANSFER_IN','TRANSFER_OUT'
);

create table inventory_transactions (
  id                bigint generated always as identity primary key,
  transaction_date  timestamptz not null default now(),
  warehouse_id      uuid not null references warehouses(id),
  material_id       uuid not null references materials(id),
  transaction_type  inventory_txn_type not null,
  reference_type    text,     -- 'purchase_receipt' | 'issue_receipt' | 'stocktake' | 'adjustment' | 'transfer'
  reference_id      uuid,
  quantity_in       numeric(14,3) not null default 0,
  quantity_out      numeric(14,3) not null default 0,
  unit_cost         numeric(14,4),      -- giá tại giao dịch (nhập) hoặc giá BQ tại thời điểm xuất
  total_cost        numeric(14,2),
  balance_quantity  numeric(14,3) not null, -- tồn sau giao dịch
  balance_value     numeric(14,2) not null, -- giá trị tồn sau giao dịch
  average_cost      numeric(14,4) not null, -- giá bình quân sau giao dịch
  created_by        uuid references users(id),
  created_at        timestamptz not null default now()
);
create index idx_inv_txn_material_wh on inventory_transactions(material_id, warehouse_id, transaction_date);
create index idx_inv_txn_reference on inventory_transactions(reference_type, reference_id);

-- ============================ 7. KIỂM KÊ / ĐIỀU CHỈNH ============================

create table stocktakes (
  id            uuid primary key default gen_random_uuid(),
  stocktake_no  text unique not null,
  stocktake_date date not null default current_date,
  warehouse_id  uuid not null references warehouses(id),
  status        text not null default 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, POSTED
  created_by    uuid references users(id),
  approved_by   uuid references users(id),
  note          text,
  created_at    timestamptz not null default now()
);

create table stocktake_details (
  id              uuid primary key default gen_random_uuid(),
  stocktake_id    uuid not null references stocktakes(id) on delete cascade,
  material_id     uuid not null references materials(id),
  book_quantity   numeric(14,3) not null, -- tồn sổ sách tại thời điểm kiểm kê
  actual_quantity numeric(14,3) not null, -- nhân viên nhập tay
  variance_quantity numeric(14,3) generated always as (actual_quantity - book_quantity) stored,
  unit_cost       numeric(14,4),
  variance_value  numeric(14,2)
);
create index idx_stocktake_details_st on stocktake_details(stocktake_id);

create table inventory_adjustments (
  id              uuid primary key default gen_random_uuid(),
  adjustment_no   text unique not null,
  adjustment_date date not null default current_date,
  stocktake_id    uuid references stocktakes(id),
  warehouse_id    uuid not null references warehouses(id),
  material_id     uuid not null references materials(id),
  direction       text not null, -- 'IN' | 'OUT'
  quantity        numeric(14,3) not null,
  unit_cost       numeric(14,4),
  value           numeric(14,2),
  reason          text not null,
  created_by      uuid references users(id),
  approved_by     uuid references users(id),
  status          text not null default 'DRAFT', -- DRAFT, SUBMITTED, APPROVED, POSTED
  created_at      timestamptz not null default now()
);

-- ============================ 8. CHỐT KỲ ============================

create table inventory_periods (
  id              uuid primary key default gen_random_uuid(),
  period_month    int not null,
  period_year     int not null,
  warehouse_id    uuid not null references warehouses(id),
  opening_quantity numeric(14,3),
  opening_value    numeric(14,2),
  total_in_quantity numeric(14,3),
  total_in_value    numeric(14,2),
  total_out_quantity numeric(14,3),
  total_out_value    numeric(14,2),
  closing_quantity numeric(14,3),
  closing_value    numeric(14,2),
  status          text not null default 'OPEN', -- OPEN, PENDING, CLOSED
  closed_by       uuid references users(id),
  closed_at       timestamptz,
  unique (period_month, period_year, warehouse_id)
);

-- ============================ 9. RLS ============================
-- Theo đúng pattern đã dùng ở các app nội bộ khác (P&L Eros 143, DebtFlow,...):
-- authenticate qua RPC riêng (bcrypt), sau đó "allow all" cho các bảng
-- nghiệp vụ vì phân quyền được xử lý ở tầng application theo role_id.

alter table roles enable row level security;
alter table permissions enable row level security;
alter table users enable row level security;
alter table audit_logs enable row level security;
alter table warehouses enable row level security;
alter table material_groups enable row level security;
alter table suppliers enable row level security;
alter table materials enable row level security;
alter table product_groups enable row level security;
alter table products enable row level security;
alter table revenue_types enable row level security;
alter table salespersons enable row level security;
alter table customers enable row level security;
alter table recipes enable row level security;
alter table recipe_details enable row level security;
alter table cost_history enable row level security;
alter table menus enable row level security;
alter table menu_details enable row level security;
alter table orders enable row level security;
alter table order_details enable row level security;
alter table purchase_receipts enable row level security;
alter table purchase_receipt_details enable row level security;
alter table issue_receipts enable row level security;
alter table issue_receipt_details enable row level security;
alter table inventory_transactions enable row level security;
alter table stocktakes enable row level security;
alter table stocktake_details enable row level security;
alter table inventory_adjustments enable row level security;
alter table inventory_periods enable row level security;

do $$
declare t text;
begin
  for t in select unnest(array[
    'roles','permissions','users','audit_logs','warehouses','material_groups',
    'suppliers','materials','product_groups','products','revenue_types',
    'salespersons','customers','recipes','recipe_details','cost_history',
    'menus','menu_details','orders','order_details','purchase_receipts',
    'purchase_receipt_details','issue_receipts','issue_receipt_details',
    'inventory_transactions','stocktakes','stocktake_details',
    'inventory_adjustments','inventory_periods'])
  loop
    execute format('create policy allow_all_%1$s on %1$s for all using (true) with check (true);', t);
  end loop;
end $$;

-- ============================ 10. SEED DỮ LIỆU HỆ THỐNG ============================

insert into roles (code, name) values
  ('admin','Quản trị viên'),
  ('quan_ly','Quản lý'),
  ('nhan_vien_kho','Nhân viên kho'),
  ('nhan_vien_kinh_doanh','Nhân viên kinh doanh'),
  ('ke_toan','Kế toán'),
  ('bep','Bếp');

insert into warehouses (code, name, warehouse_type) values
  ('KHO-UOT','Kho ướt','kho_uot'),
  ('KHO-KHO','Kho khô','kho_kho'),
  ('KHO-DOUONG','Kho đồ uống','kho_do_uong'),
  ('KHO-TP','Kho thành phẩm','kho_thanh_pham');
