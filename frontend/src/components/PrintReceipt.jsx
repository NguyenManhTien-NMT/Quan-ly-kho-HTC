import { X, Printer } from 'lucide-react'

// Modal xem trước + in phiếu (Nhập kho hoặc Xuất kho). Bấm "In" sẽ mở hộp
// thoại in của trình duyệt, chỉ in đúng phần phiếu (nhờ CSS .print-area
// trong index.css), không in kèm sidebar/menu.
export default function PrintReceipt({ type, header, lines, totalLabel = 'Tổng cộng', onClose }) {
  // type: 'nhap' | 'xuat'
  const title = type === 'nhap' ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="no-print flex items-center justify-between px-6 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div className="text-sm text-gray-500">Xem trước phiếu in</div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200">Đóng</button>
            <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-brand-600 text-white font-medium">
              <Printer size={14} /> In phiếu
            </button>
          </div>
        </div>

        <div className="print-area p-8 text-sm">
          <div className="text-center mb-6">
            <img src="/logo-print.png" alt="Phú Tài Đức Group" className="h-10 mx-auto mb-2" />
            <div className="font-semibold text-base">Khách sạn White</div>
            <div className="text-lg font-bold mt-2 tracking-wide">{title}</div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-5">
            {header.map((h) => (
              <div key={h.label}><span className="text-gray-500">{h.label}: </span><span className="font-medium">{h.value || '—'}</span></div>
            ))}
          </div>

          <table className="w-full border-collapse mb-5">
            <thead>
              <tr>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-left">#</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-left">Mã</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-left">Tên</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-left">ĐVT</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-right">Số lượng</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-right">Đơn giá</th>
                <th className="border border-gray-300 px-2 py-1.5 text-xs text-right">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={idx}>
                  <td className="border border-gray-300 px-2 py-1 text-xs">{idx + 1}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">{l.code}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">{l.name}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs">{l.unit}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs text-right">{Number(l.quantity).toLocaleString('vi-VN')}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs text-right">{l.unitPrice != null ? Number(l.unitPrice).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : ''}</td>
                  <td className="border border-gray-300 px-2 py-1 text-xs text-right">{l.amount != null ? Number(l.amount).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="border border-gray-300 px-2 py-1.5 text-xs text-right font-semibold">{totalLabel}</td>
                <td className="border border-gray-300 px-2 py-1.5 text-xs text-right font-semibold">
                  {lines.reduce((s, l) => s + (Number(l.amount) || 0), 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                </td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-3 gap-4 text-center mt-10 text-xs">
            <div>
              <div className="font-medium mb-12">Người lập phiếu</div>
              <div className="text-gray-400">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-medium mb-12">Thủ kho</div>
              <div className="text-gray-400">(Ký, ghi rõ họ tên)</div>
            </div>
            <div>
              <div className="font-medium mb-12">Kế toán trưởng</div>
              <div className="text-gray-400">(Ký, ghi rõ họ tên)</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
