import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, ClipboardPaste, Calculator } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'

const STATUS_BADGE = {
  DRAFT: { label: 'Nháp', variant: 'gray' },
  POSTED: { label: 'Đã ghi sổ', variant: 'green' },
  CANCELLED: { label: 'Đã huỷ', variant: 'red' },
}

function genCode(prefix) {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `${prefix}-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`
}
function emptyProductLine() { return { code: '', quantity: '', selling_price: '' } }

export default function XuatKho() {
  const { user } = useAuth()
  const [rows, setRows] = useState([]) // issue_receipts + order
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [recipeCache, setRecipeCache] = useState({}) // product_id -> [{material_id, quantity}]

  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRows(); loadRefs() }, [])

  async function loadRows() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('issue_receipts')
      .select('*, orders(order_code, revenue, status), issue_receipt_details(*)')
      .eq('issue_source', 'order')
      .order('issue_date', { ascending: false })
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [w, p, m] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('products').select('id,product_code,product_name,unit,selling_price').eq('active', true),
      supabase.from('materials').select('id,material_code,material_name,unit').eq('active', true),
    ])
    setWarehouses(w.data || [])
    setProducts(p.data || [])
    setMaterials(m.data || [])
  }

  const productByCode = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[String(p.product_code).trim().toLowerCase()] = p })
    return map
  }, [products])
  const materialById = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[m.id] = m })
    return map
  }, [materials])

  function resolveProduct(code) {
    if (!code) return null
    return productByCode[String(code).trim().toLowerCase()] || null
  }

  async function getRecipeLines(productId) {
    if (recipeCache[productId]) return recipeCache[productId]
    const { data: recipe } = await supabase.from('recipes').select('id').eq('product_id', productId).eq('active', true).maybeSingle()
    if (!recipe) { setRecipeCache((c) => ({ ...c, [productId]: [] })); return [] }
    const { data: details } = await supabase.from('recipe_details').select('material_id, quantity').eq('recipe_id', recipe.id)
    const lines = details || []
    setRecipeCache((c) => ({ ...c, [productId]: lines }))
    return lines
  }

  function openCreate() {
    setCreating({
      header: { issue_no: genCode('PX'), order_code: genCode('DH'), issue_date: new Date().toISOString().slice(0, 10), warehouse_id: '', note: '' },
      productLines: Array.from({ length: 5 }, emptyProductLine),
      materialLines: [], // [{material_id, code, name, unit, suggested, quantity}]
    })
  }

  // ----- Lưới nhập MÓN (giống hệt tương tác của lưới Nhập kho) -----
  const codeRefs = useRef([]); const qtyRefs = useRef([]); const priceRefs = useRef([])
  const REFS_BY_COL = [codeRefs, qtyRefs, priceRefs]

  function updateProductLine(idx, field, value) {
    setCreating((c) => { const lines = [...c.productLines]; lines[idx] = { ...lines[idx], [field]: value }; return { ...c, productLines: lines } })
  }
  function onPickProduct(idx, code) {
    setCreating((c) => {
      const lines = [...c.productLines]
      const line = { ...lines[idx], code }
      const p = productByCode[code.trim().toLowerCase()]
      if (p) line.selling_price = String(p.selling_price)
      lines[idx] = line
      return { ...c, productLines: lines }
    })
  }
  function addProductRows(n) { setCreating((c) => ({ ...c, productLines: [...c.productLines, ...Array.from({ length: n }, emptyProductLine)] })) }
  function removeProductLine(idx) { setCreating((c) => ({ ...c, productLines: c.productLines.filter((_, i) => i !== idx) })) }

  function selectAll(e) { e.target.select() }
  function handleGridKeyDown(e, rowIdx, colIdx) {
    const el = e.target
    const fullySelected = el.selectionStart === 0 && el.selectionEnd === (el.value ? el.value.length : 0)
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !fullySelected) return
    let targetRow = rowIdx, targetCol = colIdx
    if (e.key === 'ArrowUp') targetRow -= 1
    else if (e.key === 'ArrowDown') targetRow += 1
    else if (e.key === 'ArrowLeft') targetCol -= 1
    else if (e.key === 'ArrowRight') targetCol += 1
    else return
    if (targetCol < 0 || targetCol > 2 || targetRow < 0) { e.preventDefault(); return }
    const refs = REFS_BY_COL[targetCol]
    if (targetRow >= refs.current.length) { e.preventDefault(); return }
    e.preventDefault(); refs.current[targetRow]?.focus(); refs.current[targetRow]?.select?.()
  }
  function handleCodeKeyDown(e, idx) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) handleGridKeyDown(e, idx, 0)
  }
  function handlePriceKeyDown(e, idx) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { handleGridKeyDown(e, idx, 2); return }
    if (e.key === 'Tab' && !e.shiftKey && idx === creating.productLines.length - 1) {
      e.preventDefault()
      setCreating((c) => ({ ...c, productLines: [...c.productLines, emptyProductLine()] }))
      setTimeout(() => { codeRefs.current[idx + 1]?.focus(); codeRefs.current[idx + 1]?.select?.() }, 0)
    }
  }
  function handlePasteCode(e, startIdx) {
    const text = e.clipboardData?.getData('text')
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return
    e.preventDefault()
    const pastedRows = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0).map((l) => l.split('\t'))
    setCreating((c) => {
      const lines = [...c.productLines]
      pastedRows.forEach((cols, i) => {
        const idx = startIdx + i
        while (idx >= lines.length) lines.push(emptyProductLine())
        lines[idx] = {
          code: (cols[0] || '').trim(),
          quantity: (cols[1] || '').toString().trim().replace(',', '.'),
          selling_price: (cols[2] || '').toString().trim().replace(/\./g, '').replace(',', '.'),
        }
      })
      return { ...c, productLines: lines }
    })
  }

  const resolvedProductLines = (creating?.productLines || []).map((l) => ({ ...l, product: resolveProduct(l.code) }))
  const totalRevenue = resolvedProductLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.selling_price) || 0), 0)
  const unresolvedProductCount = resolvedProductLines.filter((l) => l.code && !l.product).length
  const validProductLines = resolvedProductLines.filter((l) => l.product && Number(l.quantity) > 0)

  // ----- Tính NVL cần xuất theo Cost (yêu cầu 1+3) -----
  async function computeMaterialNeeds() {
    setError('')
    if (validProductLines.length === 0) { setError('Cần ít nhất 1 dòng món hợp lệ trước khi tính NVL.'); return }
    const needMap = {} // material_id -> qty
    for (const l of validProductLines) {
      const lines = await getRecipeLines(l.product.id)
      if (lines.length === 0) {
        setError(`Món "${l.product.product_name}" chưa có Cost món (công thức) — vào Cost món khai báo trước.`)
      }
      lines.forEach((rd) => {
        needMap[rd.material_id] = (needMap[rd.material_id] || 0) + Number(rd.quantity) * Number(l.quantity)
      })
    }
    const materialLines = Object.entries(needMap).map(([material_id, suggested]) => {
      const mat = materialById[material_id]
      return { material_id, code: mat?.material_code, name: mat?.material_name, unit: mat?.unit, suggested, quantity: String(Math.round(suggested * 1000) / 1000) }
    })
    setCreating((c) => ({ ...c, materialLines }))
  }

  function updateMaterialQty(idx, value) {
    setCreating((c) => { const lines = [...c.materialLines]; lines[idx] = { ...lines[idx], quantity: value }; return { ...c, materialLines: lines } })
  }
  function removeMaterialLine(idx) { setCreating((c) => ({ ...c, materialLines: c.materialLines.filter((_, i) => i !== idx) })) }

  async function handleSaveDraft(e) {
    e.preventDefault()
    setError('')
    if (unresolvedProductCount > 0) { setError('Có dòng mã món không khớp danh mục.'); return }
    if (validProductLines.length === 0) { setError('Cần ít nhất 1 dòng món hợp lệ.'); return }
    if (!creating.header.warehouse_id) { setError('Chưa chọn Kho xuất.'); return }
    const validMaterialLines = creating.materialLines.filter((l) => Number(l.quantity) > 0)
    if (validMaterialLines.length === 0) { setError('Chưa có dòng NVL nào để xuất — bấm "Tính NVL cần xuất theo Cost" trước.'); return }

    setSaving(true)
    const { data: order, error: e1 } = await supabase
      .from('orders')
      .insert({ order_code: creating.header.order_code, order_date: creating.header.issue_date, warehouse_id: creating.header.warehouse_id, note: creating.header.note, created_by: user.id, status: 'DRAFT', revenue: totalRevenue })
      .select().single()
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('order_details').insert(
      validProductLines.map((l) => ({
        order_id: order.id, item_type: 'product', product_id: l.product.id,
        quantity: Number(l.quantity), selling_price: Number(l.selling_price) || 0,
        revenue: (Number(l.quantity) || 0) * (Number(l.selling_price) || 0),
      }))
    )
    if (e2) { setError(e2.message); setSaving(false); return }

    const { data: issue, error: e3 } = await supabase
      .from('issue_receipts')
      .insert({ issue_no: creating.header.issue_no, warehouse_id: creating.header.warehouse_id, issue_source: 'order', order_id: order.id, status: 'DRAFT' })
      .select().single()
    if (e3) { setError(e3.message); setSaving(false); return }

    const { error: e4 } = await supabase.from('issue_receipt_details').insert(
      validMaterialLines.map((l) => ({ issue_id: issue.id, material_id: l.material_id, quantity: Number(l.quantity) }))
    )
    setSaving(false)
    if (e4) { setError(e4.message); return }
    setCreating(null)
    loadRows()
  }

  async function postRow(row) {
    if (!confirm(`Ghi sổ phiếu xuất ${row.issue_no}? Tồn kho sẽ trừ ngay và lịch sử cost món sẽ được cập nhật.`)) return
    setBusyId(row.id)
    setError('')
    const { error: e1 } = await supabase.rpc('post_issue_receipt', { p_issue_id: row.id, p_user_id: user.id })
    if (e1) { setError(e1.message); setBusyId(null); return }
    const { error: e2 } = await supabase.rpc('finalize_product_issue', { p_order_id: row.order_id, p_issue_no: row.issue_no, p_user_id: user.id })
    setBusyId(null)
    if (e2) setError(e2.message)
    else loadRows()
  }

  async function cancelRow(row) {
    const reason = prompt(`Nhập lý do huỷ phiếu ${row.issue_no}:`)
    if (reason === null) return
    if (!reason.trim()) { setError('Cần nhập lý do huỷ.'); return }
    setBusyId(row.id)
    setError('')
    const { error } = await supabase.rpc('cancel_issue_receipt', { p_issue_id: row.id, p_user_id: user.id, p_reason: reason.trim() })
    setBusyId(null)
    if (error) setError(error.message)
    else loadRows()
  }

  if (creating) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-ink">Xuất kho theo món</h1>
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
            <div><label className="block text-xs text-gray-500 mb-1">Số phiếu xuất</label>
              <input value={creating.header.issue_no} readOnly className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Ngày</label>
              <input type="date" value={creating.header.issue_date}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, issue_date: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Kho xuất *</label>
              <select value={creating.header.warehouse_id} required
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, warehouse_id: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div className="md:col-span-3"><label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
              <input value={creating.header.note} onChange={(e) => setCreating({ ...creating, header: { ...creating.header, note: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ClipboardPaste size={15} /> Nhập/dán Mã món — Số lượng — Giá bán (giống lưới Nhập kho: Tab, mũi tên 4 hướng, dán nhiều dòng đều dùng được).
            </div>
            <div className="flex gap-3 items-center">
              <div className="text-sm"><span className="text-gray-400">Doanh thu tạm tính: </span><span className="font-semibold text-ink">{totalRevenue.toLocaleString('vi-VN')}</span></div>
              <button onClick={() => addProductRows(5)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-xs">+5 dòng</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-3 py-2 w-10 text-xs text-gray-400">#</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã món</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên món</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-24 text-right">SL bán</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Giá bán</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Doanh thu</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {resolvedProductLines.map((l, idx) => {
                const revenue = (Number(l.quantity) || 0) * (Number(l.selling_price) || 0)
                const invalid = l.code && !l.product
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-1 py-1">
                      <input ref={(el) => (codeRefs.current[idx] = el)} list="products-datalist-xk" value={l.code}
                        onChange={(e) => onPickProduct(idx, e.target.value)} onPaste={(e) => handlePasteCode(e, idx)}
                        onKeyDown={(e) => handleCodeKeyDown(e, idx)} onFocus={selectAll}
                        placeholder="Gõ mã món..." className={`w-full rounded-md border px-2 py-1.5 text-sm ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                    </td>
                    <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{l.product?.product_name || (invalid ? <span className="text-red-500 text-xs">Không tìm thấy mã</span> : '')}</td>
                    <td className="px-1 py-1">
                      <input ref={(el) => (qtyRefs.current[idx] = el)} type="text" inputMode="decimal" value={l.quantity}
                        onChange={(e) => updateProductLine(idx, 'quantity', e.target.value)} onPaste={(e) => handlePasteCode(e, idx)}
                        onKeyDown={(e) => handleGridKeyDown(e, idx, 1)} onFocus={selectAll}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                    </td>
                    <td className="px-1 py-1">
                      <input ref={(el) => (priceRefs.current[idx] = el)} type="text" inputMode="decimal" value={l.selling_price}
                        onChange={(e) => updateProductLine(idx, 'selling_price', e.target.value)} onPaste={(e) => handlePasteCode(e, idx)}
                        onKeyDown={(e) => handlePriceKeyDown(e, idx)} onFocus={selectAll}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                    </td>
                    <td className="px-3 py-1 text-right font-medium text-ink">{revenue > 0 ? revenue.toLocaleString('vi-VN') : ''}</td>
                    <td className="px-2 py-1 text-center"><button tabIndex={-1} onClick={() => removeProductLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="products-datalist-xk">
            {products.map((p) => <option key={p.id} value={p.product_code}>{p.product_name}</option>)}
          </datalist>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="text-sm text-gray-500">NVL cần xuất (tự tính theo Cost món — kiểm tra rồi sửa lại số lượng thực xuất nếu cần)</div>
            <button onClick={computeMaterialNeeds} className="inline-flex items-center gap-2 text-xs text-brand-600 hover:underline">
              <Calculator size={14} /> Tính NVL cần xuất theo Cost
            </button>
          </div>
          {creating.materialLines.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Chưa tính — bấm "Tính NVL cần xuất theo Cost" ở trên sau khi đã nhập đủ dòng món.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-20">ĐVT</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL đề xuất</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL thực xuất</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {creating.materialLines.map((l, idx) => (
                  <tr key={l.material_id} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1.5">{l.code}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.name}</td>
                    <td className="px-3 py-1.5 text-gray-400 text-xs">{l.unit}</td>
                    <td className="px-3 py-1.5 text-right text-gray-400">{Number(l.suggested).toLocaleString('vi-VN')}</td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" value={l.quantity} onChange={(e) => updateMaterialQty(idx, e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right font-medium" />
                    </td>
                    <td className="px-2 py-1 text-center"><button onClick={() => removeMaterialLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Xuất kho theo món</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rows.length} phiếu</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadRows} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Tạo phiếu xuất
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có phiếu xuất nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số phiếu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Đơn hàng</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Doanh thu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số dòng NVL</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Trạng thái</th>
                <th className="px-4 py-3 w-56"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.DRAFT
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{r.issue_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.orders?.order_code}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{Number(r.orders?.revenue || 0).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3">{(r.issue_receipt_details || []).length}</td>
                    <td className="px-4 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      {busyId === r.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : r.status === 'DRAFT' ? (
                        <button onClick={() => postRow(r)} className="text-green-600 font-medium hover:underline">Ghi sổ (cập nhật kho)</button>
                      ) : r.status === 'POSTED' ? (
                        <button onClick={() => cancelRow(r)} className="text-red-500 hover:underline">Huỷ phiếu (hoàn tác kho)</button>
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
