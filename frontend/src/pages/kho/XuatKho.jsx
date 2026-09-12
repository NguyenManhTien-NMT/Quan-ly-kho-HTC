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

function genCode() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `PX-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`
}
function emptyMaterialLine() { return { productCode: '', code: '', quantity: '' } }

export default function XuatKho() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [orderOptions, setOrderOptions] = useState([]) // các đơn hàng DRAFT, chưa có phiếu xuất nào
  const recipeByProductId = useRef({})
  const productIdsByMaterialId = useRef({})

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
    const [w, p, m, r, rd, ord, existingIssues] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('products').select('id,product_code,product_name,unit,selling_price').eq('active', true),
      supabase.from('materials').select('id,material_code,material_name,unit').eq('active', true),
      supabase.from('recipes').select('id,product_id').eq('active', true),
      supabase.from('recipe_details').select('recipe_id,material_id,quantity'),
      supabase.from('orders').select('id,order_code,warehouse_id,revenue,order_details(product_id,quantity,selling_price,revenue)').eq('status', 'DRAFT'),
      supabase.from('issue_receipts').select('order_id').not('order_id', 'is', null),
    ])
    setWarehouses(w.data || [])
    setProducts(p.data || [])
    setMaterials(m.data || [])

    const recipeIdToProductId = {}
    ;(r.data || []).forEach((rec) => { recipeIdToProductId[rec.id] = rec.product_id })
    const byProduct = {}
    const byMaterial = {}
    ;(rd.data || []).forEach((d) => {
      const productId = recipeIdToProductId[d.recipe_id]
      if (!productId) return
      if (!byProduct[productId]) byProduct[productId] = []
      byProduct[productId].push({ material_id: d.material_id, quantity: Number(d.quantity) })
      if (!byMaterial[d.material_id]) byMaterial[d.material_id] = new Set()
      byMaterial[d.material_id].add(productId)
    })
    recipeByProductId.current = byProduct
    productIdsByMaterialId.current = byMaterial

    const usedOrderIds = new Set((existingIssues.data || []).map((x) => x.order_id))
    setOrderOptions((ord.data || []).filter((o) => !usedOrderIds.has(o.id) && (o.order_details || []).length > 0))
  }

  const productByCode = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[String(p.product_code).trim().toLowerCase()] = p })
    return map
  }, [products])
  const materialByCode = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[String(m.material_code).trim().toLowerCase()] = m })
    return map
  }, [materials])
  const productById = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[p.id] = p })
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
  function resolveMaterial(code) {
    if (!code) return null
    return materialByCode[String(code).trim().toLowerCase()] || null
  }

  const selectedOrder = orderOptions.find((o) => o.id === creating?.header?.order_id) || null
  // product_id -> SL bán thật của đơn hàng đã chọn (nguồn duy nhất để nhân
  // định lượng công thức — không còn nhập "Bán món" riêng trong trang này nữa,
  // dữ liệu bán món giờ thuộc về trang Đơn hàng).
  const soldQtyByProductId = useMemo(() => {
    const map = {}
    ;(selectedOrder?.order_details || []).forEach((d) => { if (d.product_id) map[d.product_id] = Number(d.quantity) })
    return map
  }, [selectedOrder])

  function openCreate() {
    setCreating({
      header: { issue_no: genCode(), issue_date: new Date().toISOString().slice(0, 10), order_id: '', note: '' },
      materialLines: Array.from({ length: 5 }, emptyMaterialLine),
    })
  }

  function onSelectOrder(orderId) {
    setCreating((c) => ({ ...c, header: { ...c.header, order_id: orderId } }))
  }

  function selectAll(e) { e.target.select() }

  const matProductRefs = useRef([]); const matCodeRefs = useRef([]); const matQtyRefs = useRef([])
  const MAT_REFS_BY_COL = [matCodeRefs, matQtyRefs, matProductRefs] // 0=Mã NVL,1=SL,2=Món tương ứng (trái->phải)

  function updateMaterialLine(idx, field, value) {
    setCreating((c) => { const lines = [...c.materialLines]; lines[idx] = { ...lines[idx], [field]: value }; return { ...c, materialLines: lines } })
  }
  function addMaterialRows(n) { setCreating((c) => ({ ...c, materialLines: [...c.materialLines, ...Array.from({ length: n }, emptyMaterialLine)] })) }
  function removeMaterialLine(idx) { setCreating((c) => ({ ...c, materialLines: c.materialLines.filter((_, i) => i !== idx) })) }

  // Gán "Món tương ứng" ở 1 dòng -> tự nhảy TOÀN BỘ NVL theo Cost món, nhân
  // đúng SL bán lấy từ ĐƠN HÀNG ĐÃ CHỌN (order_details), không còn phải nhập
  // "Bán món" riêng trong trang này nữa.
  function expandRecipeForRow(idx, rawCode) {
    const product = resolveProduct(rawCode)
    if (!product) return
    if (!selectedOrder) { setError('Chưa chọn Đơn hàng ở trên — cần chọn đơn hàng trước để lấy đúng SL bán.'); return }
    const recipeLines = recipeByProductId.current[product.id]
    if (!recipeLines || recipeLines.length === 0) {
      setError(`Món "${product.product_name}" chưa có Cost món (công thức) — vào Cost món khai báo trước, hoặc tự gõ tay NVL cho dòng này.`)
      return
    }
    const soldQty = soldQtyByProductId[product.id]
    if (!(soldQty > 0)) {
      setError(`Món "${product.product_name}" không có trong Đơn hàng ${selectedOrder.order_code} đã chọn (hoặc SL = 0) — không thể tự tính đúng số lượng.`)
      return
    }

    setCreating((c) => {
      let lines = [...c.materialLines]
      const existingForProduct = new Set(
        lines
          .filter((l) => l.productCode && resolveProduct(l.productCode)?.id === product.id && l.code)
          .map((l) => l.code.trim().toLowerCase())
      )
      const newRows = []
      recipeLines.forEach((rl) => {
        const mat = materialById[rl.material_id]
        if (!mat) return
        if (existingForProduct.has(mat.material_code.trim().toLowerCase())) return
        newRows.push({ productCode: rawCode, code: mat.material_code, quantity: String(Math.round(rl.quantity * soldQty * 1000) / 1000) })
      })
      if (newRows.length === 0) return c

      if (!lines[idx].code) {
        lines[idx] = { ...lines[idx], productCode: rawCode, code: newRows[0].code, quantity: newRows[0].quantity }
        lines.splice(idx + 1, 0, ...newRows.slice(1))
      } else {
        lines.splice(idx + 1, 0, ...newRows)
      }
      return { ...c, materialLines: lines }
    })
    setError('')
  }

  // Gõ Mã NVL trước -> gợi ý Món tương ứng (ưu tiên món có trong đơn hàng đã
  // chọn nếu nhiều món cùng dùng NVL này; nếu chỉ 1 món dùng NVL này trong
  // toàn hệ thống thì tự điền luôn — nhân viên vẫn sửa lại được).
  function suggestProductForMaterialRow(idx, rawCode) {
    const material = resolveMaterial(rawCode)
    if (!material) return
    setCreating((c) => {
      if (c.materialLines[idx].productCode) return c
      const candidates = productIdsByMaterialId.current[material.id]
      if (!candidates) return c
      let productId = null
      if (selectedOrder) {
        const inOrder = [...candidates].filter((pid) => soldQtyByProductId[pid] > 0)
        if (inOrder.length === 1) productId = inOrder[0]
      }
      if (!productId && candidates.size === 1) productId = [...candidates][0]
      if (!productId) return c
      const product = productById[productId]
      if (!product) return c
      const lines = [...c.materialLines]
      lines[idx] = { ...lines[idx], productCode: product.product_code }
      return { ...c, materialLines: lines }
    })
  }

  function addMaterialRowForSameProduct(idx) {
    setCreating((c) => {
      const lines = [...c.materialLines]
      lines.splice(idx + 1, 0, { productCode: lines[idx].productCode || '', code: '', quantity: '' })
      return { ...c, materialLines: lines }
    })
  }

  function handleMatKeyDown(e, idx, col) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) handleGridKeyDown(e, idx, col, MAT_REFS_BY_COL, 2)
  }
  function handleMatQtyKeyDown(e, idx) {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { handleGridKeyDown(e, idx, 1, MAT_REFS_BY_COL, 2); return }
    if (e.key === 'Tab' && !e.shiftKey && idx === creating.materialLines.length - 1) {
      e.preventDefault()
      setCreating((c) => ({ ...c, materialLines: [...c.materialLines, emptyMaterialLine()] }))
      setTimeout(() => { matCodeRefs.current[idx + 1]?.focus(); matCodeRefs.current[idx + 1]?.select?.() }, 0)
    }
  }
  function handleGridKeyDown(e, rowIdx, colIdx, refsByCol, maxCol) {
    const el = e.target
    const fullySelected = el.selectionStart === 0 && el.selectionEnd === (el.value ? el.value.length : 0)
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !fullySelected) return
    let targetRow = rowIdx, targetCol = colIdx
    if (e.key === 'ArrowUp') targetRow -= 1
    else if (e.key === 'ArrowDown') targetRow += 1
    else if (e.key === 'ArrowLeft') targetCol -= 1
    else if (e.key === 'ArrowRight') targetCol += 1
    else return
    if (targetCol < 0 || targetCol > maxCol || targetRow < 0) { e.preventDefault(); return }
    const refs = refsByCol[targetCol]
    if (targetRow >= refs.current.length) { e.preventDefault(); return }
    e.preventDefault()
    refs.current[targetRow]?.focus(); refs.current[targetRow]?.select?.()
  }
  // Dán từ Excel: Mã NVL [Tab] Số lượng (2 cột)
  function handleMatPaste(e, startIdx) {
    const text = e.clipboardData?.getData('text')
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return
    e.preventDefault()
    const pastedRows = text.split(/\r\n|\n|\r/).filter((l) => l.length > 0).map((l) => l.split('\t'))
    setCreating((c) => {
      const lines = [...c.materialLines]
      pastedRows.forEach((cols, i) => {
        const idx = startIdx + i
        while (idx >= lines.length) lines.push(emptyMaterialLine())
        lines[idx] = { productCode: lines[idx]?.productCode || '', code: (cols[0] || '').trim(), quantity: (cols[1] || '').toString().trim().replace(',', '.') }
      })
      return { ...c, materialLines: lines }
    })
  }

  const resolvedMaterialLines = (creating?.materialLines || []).map((l) => ({
    ...l, product: resolveProduct(l.productCode), material: resolveMaterial(l.code),
  }))
  const unresolvedMaterialCount = resolvedMaterialLines.filter((l) => l.code && !l.material).length

  // Tính NVL cho TOÀN BỘ món trong đơn hàng đã chọn, cùng lúc.
  function computeMaterialNeeds() {
    setError('')
    if (!selectedOrder) { setError('Chưa chọn Đơn hàng.'); return }
    const newLines = []
    const missingRecipe = []
    for (const od of selectedOrder.order_details || []) {
      if (!od.product_id || !(Number(od.quantity) > 0)) continue
      const product = productById[od.product_id]
      const recipeLines = recipeByProductId.current[od.product_id]
      if (!recipeLines || recipeLines.length === 0) {
        missingRecipe.push(product ? product.product_name : od.product_id)
        continue
      }
      recipeLines.forEach((rl) => {
        const mat = materialById[rl.material_id]
        newLines.push({
          productCode: product?.product_code || '',
          code: mat ? mat.material_code : '',
          quantity: String(Math.round(rl.quantity * Number(od.quantity) * 1000) / 1000),
        })
      })
    }
    if (missingRecipe.length > 0) {
      setError(`Các món sau chưa có Cost món (công thức), cần gõ tay NVL: ${missingRecipe.join(', ')}`)
    }
    setCreating((c) => ({ ...c, materialLines: newLines.length ? newLines : c.materialLines }))
  }

  async function handleSaveDraft(e) {
    e.preventDefault()
    setError('')
    if (!creating.header.order_id) { setError('Chưa chọn Đơn hàng.'); return }
    if (unresolvedMaterialCount > 0) { setError('Có dòng mã NVL không khớp danh mục — sửa hoặc xoá dòng đó.'); return }
    const validMaterialLines = resolvedMaterialLines.filter((l) => l.material && Number(l.quantity) > 0)
    if (validMaterialLines.length === 0) { setError('Chưa có dòng NVL nào để xuất.'); return }

    setSaving(true)
    const { data: issue, error: e1 } = await supabase
      .from('issue_receipts')
      .insert({
        issue_no: creating.header.issue_no,
        warehouse_id: selectedOrder.warehouse_id,
        issue_source: 'order',
        order_id: creating.header.order_id,
        status: 'DRAFT',
      })
      .select().single()
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('issue_receipt_details').insert(
      validMaterialLines.map((l) => ({
        issue_id: issue.id,
        material_id: l.material.id,
        product_id: l.product ? l.product.id : null,
        quantity: Number(l.quantity),
      }))
    )
    setSaving(false)
    if (e2) { setError(e2.message); return }
    setCreating(null)
    loadRows()
    loadRefs()
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
          <h1 className="text-xl font-semibold text-ink">Xuất kho</h1>
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
            <div>
              <label className="block text-xs text-gray-500 mb-1">Đơn hàng *</label>
              <select value={creating.header.order_id} required onChange={(e) => onSelectOrder(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn đơn hàng (tạo ở trang Đơn hàng) --</option>
                {orderOptions.map((o) => (
                  <option key={o.id} value={o.id}>{o.order_code} — DT {Number(o.revenue || 0).toLocaleString('vi-VN')}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3"><label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
              <input value={creating.header.note} onChange={(e) => setCreating({ ...creating, header: { ...creating.header, note: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
          {!orderOptions.length && (
            <div className="mt-3 text-xs text-gray-400">
              Chưa có đơn hàng nào để chọn — vào trang "Đơn hàng" tạo đơn (Nháp) trước, quay lại đây để xuất kho theo đơn đó.
            </div>
          )}
          {selectedOrder && (
            <div className="mt-3 text-xs text-gray-500">
              Món trong đơn: {(selectedOrder.order_details || []).map((d) => `${productById[d.product_id]?.product_code || '?'} x${d.quantity}`).join(', ')}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ClipboardPaste size={15} /> Gõ Mã NVL trước → gợi ý Món tương ứng. Hoặc gõ Món tương ứng → tự nhảy NVL theo đúng Cost món (nhân đúng SL của đơn hàng đã chọn). Bấm + để thêm dòng NVL cho đúng món. Vẫn gõ tay/dán từ Excel/Tab/mũi tên như lưới Nhập kho.
            </div>
            <div className="flex gap-2">
              <button onClick={computeMaterialNeeds} className="inline-flex items-center gap-2 text-xs text-brand-600 hover:underline">
                <Calculator size={14} /> Tính NVL cho cả đơn theo Cost món
              </button>
              <button onClick={() => addMaterialRows(5)} className="px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-xs">+5 dòng</button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-3 py-2 w-10 text-xs text-gray-400">#</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-20">ĐVT</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL thực xuất</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-40">Món tương ứng</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {resolvedMaterialLines.map((l, idx) => {
                const invalid = l.code && !l.material
                const productInvalid = l.productCode && !l.product
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-1 py-1">
                      <input
                        ref={(el) => (matCodeRefs.current[idx] = el)}
                        list="materials-datalist-xk" value={l.code}
                        onChange={(e) => updateMaterialLine(idx, 'code', e.target.value)}
                        onBlur={(e) => suggestProductForMaterialRow(idx, e.target.value)}
                        onPaste={(e) => handleMatPaste(e, idx)}
                        onKeyDown={(e) => handleMatKeyDown(e, idx, 0)} onFocus={selectAll}
                        placeholder="Gõ mã NVL..."
                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                    </td>
                    <td className="px-2 py-1 text-gray-600">{l.material?.material_name || (invalid ? <span className="text-red-500 text-xs">Không tìm thấy mã</span> : '')}</td>
                    <td className="px-2 py-1 text-gray-400 text-xs">{l.material?.unit || ''}</td>
                    <td className="px-1 py-1">
                      <input
                        ref={(el) => (matQtyRefs.current[idx] = el)}
                        type="text" inputMode="decimal" value={l.quantity}
                        onChange={(e) => updateMaterialLine(idx, 'quantity', e.target.value)}
                        onPaste={(e) => handleMatPaste(e, idx)}
                        onKeyDown={(e) => handleMatQtyKeyDown(e, idx)} onFocus={selectAll}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right font-medium" />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          ref={(el) => (matProductRefs.current[idx] = el)}
                          list="products-datalist-xk-mat" value={l.productCode}
                          onChange={(e) => updateMaterialLine(idx, 'productCode', e.target.value)}
                          onBlur={(e) => expandRecipeForRow(idx, e.target.value)}
                          onKeyDown={(e) => handleMatKeyDown(e, idx, 2)} onFocus={selectAll}
                          placeholder="(tuỳ chọn)"
                          className={`w-full rounded-md border px-2 py-1.5 text-sm ${productInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                        <button type="button" tabIndex={-1} title="Thêm dòng NVL cho món này"
                          onClick={() => addMaterialRowForSameProduct(idx)}
                          className="shrink-0 text-brand-600 hover:bg-brand-50 rounded p-1"><Plus size={13} /></button>
                      </div>
                      {l.product && <div className="text-xs text-gray-400 truncate">{l.product.product_name}</div>}
                    </td>
                    <td className="px-2 py-1 text-center"><button tabIndex={-1} onClick={() => removeMaterialLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="materials-datalist-xk">
            {materials.map((m) => <option key={m.id} value={m.material_code}>{m.material_name}</option>)}
          </datalist>
          <datalist id="products-datalist-xk-mat">
            {products.map((p) => <option key={p.id} value={p.product_code}>{p.product_name}</option>)}
          </datalist>
          {unresolvedMaterialCount > 0 && (
            <div className="px-5 py-2 text-xs text-red-500 border-t border-gray-50">{unresolvedMaterialCount} dòng mã NVL không khớp danh mục.</div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Xuất kho</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rows.length} phiếu</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { loadRows(); loadRefs() }} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
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
