# Web App Quản lý kho – Cost món – Giá vốn – Doanh thu nhà hàng

## 1. Đã làm trong lượt này (theo đúng mục 65 của prompt: phân tích → ERD → schema → mới code)

1. **ERD** — sơ đồ quan hệ đã hiển thị trong chat (danh mục → cost → đơn hàng → kho → kiểm kê).
2. **`supabase/schema.sql`** — 29 bảng đúng theo mục 45 + RLS + index, **đã chạy thật trên Postgres 16, không lỗi**.
3. **`supabase/functions.sql`** — logic lõi (mục 63): bình quân gia quyền liên hoàn khi nhập, giữ nguyên giá BQ khi xuất, tự sinh phiếu xuất từ Cost món/mâm, kiểm kê → điều chỉnh, xác thực đăng nhập bcrypt.
4. **`supabase/test_case_muc_62.sql`** — test case bắt buộc của bạn: tồn 100kg×50.000, nhập 50kg×60.000, xuất 20kg → **đã chạy và khớp 100% số liệu**: giá BQ 53.333,33 / giá vốn xuất 1.066.666,67 / tồn 130kg / giá trị tồn 6.933.333,33, và kiểm kê 125kg phát hiện thiếu 5kg tạo đúng đề xuất điều chỉnh.

## 1.b Đã xác nhận với bạn (lượt 2)

1. **Stack: Supabase** — giữ nguyên như đã build.
2. **Giá vốn/cost món: kế toán được tự cập nhật điều chỉnh.** Đã sửa:
   - `order_details` có thêm `cost_overridden`, `cost_updated_by`, `cost_updated_at`.
   - Khi kế toán gọi `override_order_detail_cost(order_detail_id, giá_mới, user_id, lý_do)`, dòng đó được đánh dấu `cost_overridden = true` và **hệ thống sẽ không bao giờ tự tính lại đè lên** giá trị này khi có phiếu xuất phát sinh thêm — mọi thay đổi đều ghi `audit_logs`.
   - `reset_order_detail_cost(...)` cho phép quay lại chế độ tự động tính theo giá vốn NVL thực tế.
   - `update_recipe_allocated_cost(...)` cho phép kế toán sửa định mức cost món ở cấp công thức (áp dụng cho mọi đơn hàng dùng món đó từ sau thời điểm sửa), dùng khi `cost_mode = 'phan_bo'`.
   - Đã test thật trên Postgres: ghi đè 650.000 → 700.000, profit tự cập nhật 800.000, có audit log, hoàn tác về tự động thành công. Xem `supabase/test_case_override_cost.sql`.
3. **Dự án mới** — chưa tạo repo GitHub thay bạn (không có quyền truy cập tài khoản GitHub của bạn trong phiên này). File đính kèm ở dạng zip, bạn tự khởi tạo repo và push.
4. **Frontend Phase 1 đã build** — xem mục 6 bên dưới.

## 2. ASSUMPTION (giả định cần bạn xác nhận)

| # | Điểm chưa rõ trong prompt | Giả định đã chọn | Vì sao |
|---|---|---|---|
| A1 | Backend Node.js/Prisma riêng | Supabase Postgres (RLS + Postgres functions làm service layer) + React/Vite/Tailwind, deploy Vercel | Đúng pattern đã chạy thật ở [[pl-eros-143]], [[debtflow]], [[gungho-app]], [[ch-54-xuan-thuy]] của bạn; không cần vận hành server Node riêng |
| A2 | Phân bổ giá vốn khi 1 đơn hàng có nhiều dòng món nhưng xuất kho gộp theo NVL | Phân bổ tổng giá vốn NVL đã xuất theo **tỷ trọng doanh thu** từng dòng | Đơn giản, đúng hướng "Giá vốn đơn hàng"; **Phase 5 nên tách issue_receipt_details theo từng order_detail_id ngay từ đầu** để chính xác tuyệt đối thay vì phân bổ ước lượng — đây là điểm cần bạn quyết định trước khi build Phase 5 |
| A3 | `cost_mode = 'phan_bo'` (giữ nguyên số cũ, không phụ thuộc tồn kho) — như đã chọn ở dự án Eros 143 | Cho phép song song 2 mode trên cùng bảng `recipes`: `dinh_muc` (tính động theo giá BQ NVL) và `phan_bo` (allocated_cost cố định từng dòng) | Vì bạn từng chọn cách này cho Eros 143; nếu dự án này cũng cần cost cố định cho vài món, chỉ cần set `cost_mode='phan_bo'` |
| A4 | RBAC 6 vai trò (mục 32) ánh xạ 1-1 vào `roles` + kiểm tra ở tầng ứng dụng, RLS để `allow_all` | Giống hệt pattern RLS đã dùng ở [[pl-eros-143]] | Phân quyền chi tiết theo action (view/create/approve) nằm ở bảng `permissions`, không chặn ở RLS |

## 3. Roadmap 10 Phase (giữ nguyên như bạn đã chia ở mục 60)

- [x] **Phase 1** — Database + Auth + Danh mục → **schema + functions + test đã xong ở lượt này**
- [ ] Phase 2 — Nhập kho + Sổ kho + Bình quân gia quyền (đã có function `post_purchase_receipt`, cần UI)
- [ ] Phase 3 — Cost món + Cost mâm (đã có bảng + function `compute_theoretical_cost`, cần UI + so sánh lý thuyết/thực tế)
- [ ] Phase 4 — Đơn hàng + Doanh thu (đã có bảng, cần UI)
- [ ] Phase 5 — Xuất kho tự động theo Cost (đã có function `generate_issue_from_order`, **cần quyết định A2 trước**)
- [ ] Phase 6 — Kiểm kê + Điều chỉnh + Chốt kho (đã có function, cần UI + `inventory_periods` lock logic)
- [ ] Phase 7 — Báo cáo (drill-down doanh thu → NVL theo mục 44)
- [ ] Phase 8 — Dashboard (KPI + 10 biểu đồ mục 30)
- [ ] Phase 9 — Import/Export Excel (mapping mục 56)
- [ ] Phase 10 — Đối chiếu Excel vs Web App (mục 57)

## 4. Cách chạy thử ngay

1. Tạo project Supabase mới → SQL Editor → chạy `schema.sql` rồi `functions.sql`.
2. (Tuỳ chọn) chạy `test_case_muc_62.sql` để tự kiểm chứng công thức trên chính project của bạn.
3. Tạo user đầu tiên bằng SQL (bcrypt qua `crypt()`), hoặc để tôi build màn hình "Tạo tài khoản đầu tiên" ở Phase 1 phần frontend.

## 6. Frontend Phase 1 (đã build và test build thành công)

Stack: React 18 + Vite 5 + Tailwind 3 + `@supabase/supabase-js`, đăng nhập tự xây qua RPC `authenticate_user` (KHÔNG dùng Supabase Auth, giống các app khác của bạn).

Đã có:
- Trang đăng nhập.
- Sidebar theo đúng menu mục 37 (mục Phase 2+ hiển thị mờ, chưa bấm được, để bạn thấy toàn cảnh hệ thống).
- 9 màn hình Danh mục kết nối Supabase THẬT (không giả lập): Nguyên vật liệu, Nhóm NVL, Nhà cung cấp, Món ăn/thành phẩm, Nhóm món, Khách hàng, Nhân viên kinh doanh, Kho, Loại doanh thu — mỗi màn hình đều Thêm/Sửa/Xoá (xoá mềm qua cột `active` nếu bảng có, tôn trọng nguyên tắc mục 34).

Cách chạy:
```
cd frontend
cp .env.example .env   # điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```
Đăng nhập: cần tạo user thủ công trước bằng SQL, ví dụ:
```sql
insert into users(username, password_hash, full_name, role_id)
values ('admin', crypt('mat_khau_cua_ban', gen_salt('bf')),
        'Quản trị viên', (select id from roles where code='admin'));
```
Deploy: kéo vào Vercel như các app khác của bạn, khai báo 2 biến môi trường ở trên.

## 5. Việc cần bạn xác nhận để tôi làm tiếp Phase 1 (frontend) và Phase 2

- Xác nhận ASSUMPTION A1 (Supabase) — hay bạn thực sự cần Node.js server riêng?
- Repo GitHub: tạo mới hay gộp vào 1 trong các repo hiện có?
- Có cần tôi build luôn giao diện Danh mục (8 màn hình CRUD ở mục 37) trong lượt tiếp theo không?
