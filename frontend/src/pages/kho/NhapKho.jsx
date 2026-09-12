import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, ClipboardPaste } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'

const STATUS_BADGE = {
  DRAFT: { label: 'Nháp', variant: 'gray' },
  SUBMITTED: { label: 'Chờ duyệt', variant: 'amber' },
  APPROVED: { label: 'Đã duyệt', variant: 'blue' },
  POSTED: { label: 'Đã ghi sổ', variant: 'green' },
  CANCELLED: { label: 'Đã huỷ', variant: 'red' },
}

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

  function resolveMaterial(code) {
    if (!code) return null
    return materialByCode[String(code).trim().toLowerCase()] || null
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

  async function changeStatus(receipt, newStatus) {
    setBusyId(receipt.id)
    setError('')
    const { error } = await supabase.from('purchase_receipts').update({ status: newStatus }).eq('id', receipt.id)
    setBusyId(null)
    if (error) setError(error.message)
    else loadReceipts()
  }

  async function postReceipt(receipt) {
    if (!confirm(`Ghi sổ phiếu ${receipt.receipt_no}? Sau bước này tồn kho và giá bình quân sẽ cập nhật, không thể sửa/xoá phiếu.`)) return
    setBusyId(receipt.id)
    setError('')
    const { error } = await supabase.rpc('post_purchase_receipt', { p_receipt_id: receipt.id, p_user_id: user.id })
    setBusyId(null)
    if (error) setError(error.message)
    else loadReceipts()
  }

  if (creating) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-ink">Tạo phiếu nhập kho</h1>
          <div className="flex gap-2">
            <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
            <button onClick={handleSaveDraft} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu nháp'}
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
            <div className="flex gap-2 text-xs">
              <button onClick={() => addRows(1)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+1 dòng</button>
              <button onClick={() => addRows(10)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+10 dòng</button>
              <button onClick={() => addRows(50)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50">+50 dòng</button>
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
                          list="materials-datalist"
                          value={l.code}
                          onChange={(e) => updateLine(idx, 'code', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          placeholder="Mã NVL..."
                          className={`w-full rounded-md border px-2 py-1.5 text-sm ${codeInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        />
                      </td>
                      <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{l.material?.material_name || (codeInvalid ? <span className="text-red-500 text-xs">Không tìm thấy mã</span> : '')}</td>
                      <td className="px-2 py-1 text-gray-400 text-xs">{l.material?.unit || ''}</td>
                      <td className="px-1 py-1">
                        <input type="text" inputMode="decimal" value={l.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" inputMode="decimal" value={l.unit_price}
                          onChange={(e) => updateLine(idx, 'unit_price', e.target.value)}
                          onPaste={(e) => handlePasteCode(e, idx)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-3 py-1 text-right text-gray-700">{amount > 0 ? amount.toLocaleString('vi-VN') : ''}</td>
                      <td className="px-2 py-1 text-center">
                        <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="materials-datalist">
              {materials.map((m) => <option key={m.id} value={m.material_code}>{m.material_name}</option>)}
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
                      {busyId === r.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : r.status === 'DRAFT' ? (
                        <button onClick={() => changeStatus(r, 'SUBMITTED')} className="text-brand-600 hover:underline">Gửi duyệt</button>
                      ) : r.status === 'SUBMITTED' ? (
                        <>
                          <button onClick={() => changeStatus(r, 'APPROVED')} className="text-brand-600 hover:underline">Duyệt</button>
                          <span className="text-gray-300 mx-1.5">|</span>
                          <button onClick={() => changeStatus(r, 'DRAFT')} className="text-red-500 hover:underline">Từ chối</button>
                        </>
                      ) : r.status === 'APPROVED' ? (
                        <button onClick={() => postReceipt(r)} className="text-green-600 font-medium hover:underline">Ghi sổ (cập nhật kho)</button>
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
    </div>
  )
}
