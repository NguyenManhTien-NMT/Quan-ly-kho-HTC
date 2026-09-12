export default function Dashboard() {
  return (
    <div className="p-6 md:p-8">
      <h1 className="text-xl font-semibold text-ink mb-1">Dashboard</h1>
      <p className="text-sm text-gray-400 mb-6">
        KPI doanh thu, giá vốn, food cost, tồn kho sẽ hiển thị ở đây từ Phase 8,
        sau khi có dữ liệu Đơn hàng (Phase 4) và Kho (Phase 2).
      </p>
      <div className="rounded-xl border border-gray-100 bg-white p-8 text-sm text-gray-400 text-center">
        Bắt đầu bằng cách khai báo Danh mục ở menu bên trái.
      </div>
    </div>
  )
}
