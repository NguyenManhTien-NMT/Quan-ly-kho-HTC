import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, ClipboardPaste, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'
import PrintReceipt from '../../components/PrintReceipt'

const STATUS_BADGE = {
  DRAFT: { label: 'Nháp', variant: 'gray' },
  SUBMITTED: { label: 'Chờ duyệt', variant: 'amber' },
  APPROVED: { label: 'Đã duyệt', variant: 'blue' },
  POSTED: { label: 'Đã ghi sổ', variant: 'green' },
  CANCELLED: { label: 'Đã huỷ', variant: 'red' },
}

// Đã bỏ bước Gửi duyệt/Duyệt khỏi giao diện theo yêu cầu — phiếu tạo ra ở
// trạng thái DRAFT có thể Ghi sổ thẳng. Nếu phát hiện sai sót SAU khi đã ghi
// sổ, dùng "Huỷ phiếu" để hoàn tác đúng tồn kho rồi tạo phiếu mới thay thế.

function genReceiptNo() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `PN-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`
}

function emptyLine() {
  return { code: '', quantity: '', unit_price: '' }
}

export default function NhapKho() {
  const { user } = useAuth()
  const [receipts, setReceipts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouses, setWarehouses] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [materials, setMaterials] = useState([])
  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [printing, setPrinting] = useState(null) // receipt đang xem trước để in

  useEffect(() => {
    loadReceipts()
    loadRefs()
  }, [])

  async function loadReceipts() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('purchase_receipts')
      .select('*, purchase_receipt_details(*)')
      .order('receipt_date', { ascending: false })
    if (error) setError(error.message)
    else setReceipts(data || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [w, s, m] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('suppliers').select('id,supplier_code,supplier_name').eq('active', true),
      supabase.from('materials').select('id,material_code,material_name,unit').eq('active', true),
    ])
    setWarehouses(w.data || [])
    setSuppliers(s.data || [])
    setMaterials(m.data || [])
  }

  // Tra cứu NVL theo mã (không phân biệt hoa thường, bỏ khoảng trắng thừa) — dùng khi gõ tay hoặc dán từ Excel
  const materialByCode = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[String(m.material_code).trim().toLowerCase()] = m })
    return map
  }, [materials])

  // Cho phép gõ theo TÊN NVL (không chỉ mã) — khớp chính xác tên, không phân biệt hoa/thường
  const materialByName = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[String(m.material_name).trim().toLowerCase()] = m })
    return map
  }, [materials])

  // Gợi ý (datalist) hiển thị dạng "Mã — Tên" để gõ mã HOẶC tên đều lọc ra được;
  // sau khi chọn, tách lại phần mã ở đầu để tra cứu.
  function extractCode(raw) {
    if (!raw) return ''
    const idx = raw.indexOf(' — ')
    return idx >= 0 ? raw.slice(0, idx).trim() : raw.trim()
  }

  function resolveMaterial(rawCode) {
    if (!rawCode) return null
    const code = extractCode(rawCode)
    return (
      materialByCode[code.toLowerCase()] ||
      materialByName[code.toLowerCase()] ||
      materialByName[rawCode.trim().toLowerCase()] ||
      null
    )
  }

  function openCreate() {
    setCreating({
      header: {
        receipt_no: genReceiptNo(),
        receipt_date: new Date().toISOString().slice(0, 10),
        supplier_id: '',
        warehouse_id: '',
        payment_type: 'tien_mat',
        note: '',
      },
      lines: Array.from({ length: 8 }, emptyLine),
    })
  }

  // Chỉ sửa được phiếu đang ở trạng thái Nháp (chưa ghi sổ, chưa ảnh hưởng
  // tồn kho). Phiếu đã ghi sổ (POSTED) muốn sửa thì Huỷ phiếu rồi tạo lại.
  function openEdit(receipt) {
    const lines = (receipt.purchase_receipt_details || []).map((d) => {
      const mat = materials.find((m) => m.id === d.material_id)
      return {
        code: mat ? mat.material_code : '',
        quantity: String(d.quantity ?? ''),
        unit_price: String(d.unit_price ?? ''),
      }
    })
    while (lines.length < 8) lines.push(emptyLine())
    setCreating({
      id: receipt.id,
      header: {
        receipt_no: receipt.receipt_no,
        receipt_date: receipt.receipt_date,
        supplier_id: receipt.supplier_id || '',
        warehouse_id: receipt.warehouse_id || '',
        payment_type: receipt.payment_type || 'tien_mat',
        note: receipt.note || '',
      },
      lines,
    })
  }

  function updateLine(idx, field, value) {
    setCreating((c) => {
      const lines = [...c.lines]
      lines[idx] = { ...lines[idx], [field]: value }
      return { ...c, lines }
    })
  }

  function addRows(n) {
    setCreating((c) => ({ ...c, lines: [...c.lines, ...Array.from({ length: n }, emptyLine)] }))
  }

  const codeRefs = useRef([])
  const qtyRefs = useRef([])
  const priceRefs = useRef([])
  const REFS_BY_COL = [codeRefs, qtyRefs, priceRefs] // 0=Mã NVL, 1=Số lượng, 2=Đơn giá

  // Ô Mã NVL: chỉ can thiệp phím mũi tên (điều hướng 4 hướng kiểu Excel).
  // Phím Tab để trình duyệt tự xử lý mặc định — đi tự nhiên sang phải
  // (Mã NVL -> Số lượng -> Đơn giá), xem thêm xử lý auto-thêm dòng ở ô Đơn giá.
  function handleCodeKeyDown(e, idx) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      handleGridKeyDown(e, idx, 0)
    }
  }

  // Điều hướng đủ 4 hướng kiểu Excel: Lên/Xuống luôn nhảy dòng; Trái/Phải chỉ
  // nhảy sang ô kế bên khi giá trị hiện tại đang được bôi đen toàn bộ (tức
  // chưa bắt đầu gõ sửa) — nếu đang gõ dở giữa chừng thì để trình duyệt tự xử
  // lý di chuyển con trỏ trong ô như bình thường. Ô đến sẽ tự bôi đen (nhờ
  // onFocus={selectAll}) để gõ số mới thay thế luôn giá trị cũ.
  function handleGridKeyDown(e, rowIdx, colIdx) {
    const el = e.target
    const fullySelected = el.selectionStart === 0 && el.selectionEnd === (el.value ? el.value.length : 0)

    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !fullySelected) return // đang gõ dở -> để trình duyệt tự lo

    let targetRow = rowIdx
    let targetCol = colIdx
    if (e.key === 'ArrowUp') targetRow -= 1
    else if (e.key === 'ArrowDown') targetRow += 1
    else if (e.key === 'ArrowLeft') targetCol -= 1
    else if (e.key === 'ArrowRight') targetCol += 1
    else return

    if (targetCol < 0 || targetCol > 2 || targetRow < 0) { e.preventDefault(); return }
    const targetRefs = REFS_BY_COL[targetCol]
    if (targetRow >= targetRefs.current.length) { e.preventDefault(); return }

    e.preventDefault()
    targetRefs.current[targetRow]?.focus()
    targetRefs.current[targetRow]?.select?.()
  }

  function selectAll(e) {
    e.target.select()
  }

  // Ô Đơn giá (ô cuối cùng bên phải của mỗi dòng): nếu đang ở dòng cuối cùng
  // và bấm Tab, tự thêm 1 dòng mới rồi nhảy xuống ô Mã NVL của dòng đó — để
  // gõ liên tục không bị "hết dòng" giữa chừng. Các dòng khác để Tab mặc định
  // tự nhảy xuống Mã NVL của dòng kế tiếp (đã bỏ nút Xoá khỏi thứ tự Tab).
  function handlePriceKeyDown(e, idx) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      handleGridKeyDown(e, idx, 2)
      return
    }
    if (e.key === 'Tab' && !e.shiftKey && idx === creating.lines.length - 1) {
      e.preventDefault()
      setCreating((c) => ({ ...c, lines: [...c.lines, emptyLine()] }))
      setTimeout(() => {
        codeRefs.current[idx + 1]?.focus()
        codeRefs.current[idx + 1]?.select?.()
      }, 0)
    }
  }

  function removeLine(idx) {
    setCreating((c) => ({ ...c, lines: c.lines.filter((_, i) => i !== idx) }))
  }

  // Dán nhiều dòng từ Excel: mỗi dòng là 1 NVL, các cột cách nhau bằng Tab, thứ tự
  // Mã NVL [Tab] Số lượng [Tab] Đơn giá. Dán vào ô "Mã NVL" của dòng bất kỳ sẽ tự
  // điền tràn xuống các dòng tiếp theo (tự thêm dòng mới nếu không đủ).
  function handlePasteCode(e, startIdx) {
    const text = e.clipboardData?.getData('text')
    if (!text || !text.includes('\n') && !text.includes('\t')) return // để hành vi gõ/dán 1 ô bình thường
    e.preventDefault()
    const pastedRows = text
      .split(/\r\n|\n|\r/)
      .filter((line) => line.length > 0)
      .map((line) => line.split('\t'))

    setCreating((c) => {
      const lines = [...c.lines]
      pastedRows.forEach((cols, i) => {
        const idx = startIdx + i
        while (idx >= lines.length) lines.push(emptyLine())
        lines[idx] = {
          code: (cols[0] || '').trim(),
          quantity: (cols[1] || '').toString().trim().replace(',', '.'),
          unit_price: (cols[2] || '').toString().trim().replace(/\./g, '').replace(',', '.'),
        }
      })
      return { ...c, lines }
    })
  }

  const resolvedLines = (creating?.lines || []).map((l) => ({ ...l, material: resolveMaterial(l.code) }))
  const total = resolvedLines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0)
  const unresolvedCount = resolvedLines.filter((l) => l.code && !l.material).length
  const validCount = resolvedLines.filter((l) => l.material && Number(l.quantity) > 0).length

  async function handleSaveDraft(e) {
    e.preventDefault()
    setError('')
    if (unresolvedCount > 0) {
      setError(`Có ${unresolvedCount} dòng gõ mã NVL không khớp danh mục — sửa lại mã hoặc xoá dòng đó trước khi lưu.`)
      return
    }
    const validLines = resolvedLines.filter((l) => l.material && Number(l.quantity) > 0)
    if (validLines.length === 0) {
      setError('Cần ít nhất 1 dòng NVL hợp lệ (mã đúng danh mục, số lượng > 0).')
      return
    }
    if (!creating.header.warehouse_id) {
      setError('Chưa chọn Kho nhập.')
      return
    }
    setSaving(true)

    if (creating.id) {
      // SỬA phiếu Nháp có sẵn: cập nhật header, xoá hết dòng cũ rồi ghi lại dòng mới
      const { error: eUpd } = await supabase.from('purchase_receipts').update(creating.header).eq('id', creating.id)
      if (eUpd) {
        setError(eUpd.message)
        setSaving(false)
        return
      }
      const { error: eDel } = await supabase.from('purchase_receipt_details').delete().eq('receipt_id', creating.id)
      if (eDel) {
        setError(eDel.message)
        setSaving(false)
        return
      }
      const { error: eIns } = await supabase.from('purchase_receipt_details').insert(
        validLines.map((l) => ({
          receipt_id: creating.id,
          material_id: l.material.id,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price) || 0,
        }))
      )
      setSaving(false)
      if (eIns) {
        setError(eIns.message)
        return
      }
      setCreating(null)
      loadReceipts()
      return
    }

    // TẠO phiếu mới
    const { data: receipt, error: e1 } = await supabase
      .from('purchase_receipts')
      .insert({ ...creating.header, created_by: user.id, status: 'DRAFT' })
      .select()
      .single()
    if (e1) {
      setError(e1.message)
      setSaving(false)
      return
    }
    const { error: e2 } = await supabase.from('purchase_receipt_details').insert(
      validLines.map((l) => ({
        receipt_id: receipt.id,
        material_id: l.material.id,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price) || 0,
      }))
    )
    setSaving(false)
    if (e2) {
      setError(e2.message)
      return
    }
    setCreating(null)
    loadReceipts()
  }

  function openPrint(receipt) {
    const supplier = suppliers.find((s) => s.id === receipt.supplier_id)
    const warehouse = warehouses.find((w) => w.id === receipt.warehouse_id)
    const lines = (receipt.purchase_receipt_details || []).map((d) => {
      const mat = materials.find((m) => m.id === d.material_id)
      return {
        code: mat?.material_code || '',
        name: mat?.material_name || '',
        unit: mat?.unit || '',
        quantity: d.quantity,
        unitPrice: d.unit_price,
        amount: d.amount,
      }
    })
    setPrinting({
      header: [
        { label: 'Số phiếu', value: receipt.receipt_no },
        { label: 'Ngày', value: receipt.receipt_date },
        { label: 'Kho nhập', value: warehouse?.name },
        { label: 'Nhà cung cấp', value: supplier?.supplier_name },
      ],
      lines,
    })
  }

  async function postReceipt(receipt) {
    if (!confirm(`Ghi sổ phiếu ${receipt.receipt_no}? Tồn kho và giá bình quân sẽ cập nhật ngay. Nếu phát hiện sai sót sau đó, bạn vẫn có thể "Huỷ phiếu" để hoàn tác.`)) return
    setBusyId(receipt.id)
    setError('')
    const { error } = await supabase.rpc('post_purchase_receipt', { p_receipt_id: receipt.id, p_user_id: user.id })
    setBusyId(null)
    if (error) setError(error.message)
    else loadReceipts()
  }

  async function cancelReceipt(receipt) {
    const reason = prompt(`Nhập lý do huỷ phiếu ${receipt.receipt_no} (bắt buộc để lưu vết):`)
    if (reason === null) return // bấm Huỷ hộp thoại
    if (!reason.trim()) {
      setError('Cần nhập lý do huỷ phiếu.')
      return
    }
    setBusyId(receipt.id)
    setError('')
    const { error } = await supabase.rpc('cancel_purchase_receipt', {
      p_receipt_id: receipt.id,
      p_user_id: user.id,
      p_reason: reason.trim(),
    })
    setBusyId(null)
    if (error) setError(error.message)
    else loadReceipts()
  }

  if (creating) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-ink">{creating.id ? 'Sửa phiếu nhập kho' : 'Tạo phiếu nhập kho'}</h1>
          <div className="flex gap-2">
            <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
            <button onClick={handleSaveDraft} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
              {saving ? 'Đang lưu...' : creating.id ? 'Cập nhật' : 'Lưu nháp'}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

        <div className="rounded-xl border border-gray-100 bg-white p-5 mb-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số phiếu</label>
              <input value={creating.header.receipt_no} readOnly className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ngày nhập</label>
              <input type="date" value={creating.header.receipt_date}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, receipt_date: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kho nhập *</label>
              <select value={creating.header.warehouse_id} required
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, warehouse_id: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nhà cung cấp</label>
              <select value={creating.header.supplier_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, supplier_id: e.target.value || null } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.supplier_code} — {s.supplier_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Hình thức thanh toán</label>
              <select value={creating.header.payment_type}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, payment_type: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="tien_mat">Tiền mặt</option>
                <option value="cong_no">Công nợ</option>
                <option value="noi_bo">Nội bộ</option>
                <option value="nhap_bat_thuong">Nhập bất thường</option>
                <option value="kho_che_bien">Kho chế biến</option>
                <option value="nhap_tu_don_vi_khac">Nhập từ đơn vị khác</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
              <input value={creating.header.note}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, note: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ClipboardPaste size={15} />
              Dán trực tiếp từ Excel vào ô "Mã NVL" (3 cột: Mã NVL — Số lượng — Đơn giá, cách nhau bằng Tab) — hệ thống tự điền tràn xuống các dòng dưới.
            </div>
            <div className="flex gap-3 items-center">
              <div className="text-sm">
                <span className="text-gray-400">Tổng tạm tính: </span>
                <span className="font-semibold text-ink">{total.toLocaleString('vi-VN')}</span>
              </div>
              <div className="flex gap-2 text-xs">
                <button onClick={() => addRows(1)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+1 dòng</button>
                <button onClick={() => addRows(10)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+10 dòng</button>
                <button onClick={() => addRows(50)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+50 dòng</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 w-10 text-xs text-gray-400">#</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-20">ĐVT</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">Số lượng</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Đơn giá</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Thành tiền</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {resolvedLines.map((l, idx) => {
                  const amount = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0)
                  const codeInvalid = l.code && !l.material
                  return (
                    <tr key={idx} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1 text-xs text-gray-400">{idx + 1}</td>
                      <td className="px-1 py-1">
                        <input
                          ref={(el) => (codeRefs.current[idx] = el)}
                          list="materials-datalist"
                          value={l.code}
                          onChange={(e) => updateLine(idx, 'code', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          onKeyDown={(e) => handleCodeKeyDown(e, idx)}
                          onFocus={selectAll}
                          placeholder="Gõ mã hoặc tên NVL..."
                          className={`w-full rounded-md border px-2 py-1.5 text-sm ${codeInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{l.material?.material_name || (codeInvalid ? <span className="text-red-500 text-xs">Không tìm thấy mã</span> : '')}</td>
                      <td className="px-2 py-1 text-gray-400 text-xs">{l.material?.unit || ''}</td>
                      <td className="px-1 py-1">
                        <input
                          ref={(el) => (qtyRefs.current[idx] = el)}
                          type="text" inputMode="decimal" value={l.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          onKeyDown={(e) => handleGridKeyDown(e, idx, 1)}
                          onFocus={selectAll}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-1 py-1">
                        <input
                          ref={(el) => (priceRefs.current[idx] = el)}
                          type="text" inputMode="decimal" value={l.unit_price}
                          onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          onKeyDown={(e) => handlePriceKeyDown(e, idx)}
                          onFocus={selectAll}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-3 py-1 text-right font-medium text-ink">{amount > 0 ? amount.toLocaleString('vi-VN') : ''}</td>
                      <td className="px-2 py-1 text-center">
                        <button tabIndex={-1} onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="materials-datalist">
              {materials.map((m) => <option key={m.id} value={`${m.material_code} — ${m.material_name}`} />)}
            </datalist>
          </div>

          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm">
            <div className="text-gray-500">
              {validCount} dòng hợp lệ{unresolvedCount > 0 && <span className="text-red-500"> · {unresolvedCount} dòng mã NVL không khớp</span>}
            </div>
            <div className="font-medium text-ink">Tổng: {total.toLocaleString('vi-VN')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Nhập kho</h1>
          <p className="text-sm text-gray-400 mt-0.5">{receipts.length} phiếu</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadReceipts} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Tạo phiếu nhập
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : receipts.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có phiếu nhập nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số phiếu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Ngày</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số dòng NVL</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Thành tiền</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Trạng thái</th>
                <th className="px-4 py-3 w-56"></th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => {
                const lineTotal = (r.purchase_receipt_details || []).reduce((s, d) => s + Number(d.amount || 0), 0)
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.DRAFT
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{r.receipt_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.receipt_date}</td>
                    <td className="px-4 py-3">{(r.purchase_receipt_details || []).length}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{lineTotal.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      <button onClick={() => openPrint(r)} title="In phiếu" className="inline text-gray-400 hover:text-brand-600 mr-2 align-middle"><Printer size={14} /></button>
                      {busyId === r.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : r.status === 'DRAFT' ? (
                        <>
                          <button onClick={() => openEdit(r)} className="text-brand-600 hover:underline">Sửa</button>
                          <span className="text-gray-300 mx-1.5">|</span>
                          <button onClick={() => postReceipt(r)} className="text-green-600 font-medium hover:underline">Ghi sổ (cập nhật kho)</button>
                        </>
                      ) : r.status === 'POSTED' ? (
                        <button onClick={() => cancelReceipt(r)} className="text-red-500 hover:underline">Huỷ phiếu (hoàn tác kho)</button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {printing && (
        <PrintReceipt type="nhap" header={printing.header} lines={printing.lines} totalLabel="Tổng tiền hàng" onClose={() => setPrinting(null)} />
      )}
    </div>
  )
}
