import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, ClipboardPaste, Calculator, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'
import PrintReceipt from '../../components/PrintReceipt'

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
function emptyMaterialLine() { return { productCode: '', code: '', quantity: '' } }

export default function XuatKho() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [printing, setPrinting] = useState(null)

  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [salespersons, setSalespersons] = useState([])
  const [revenueTypes, setRevenueTypes] = useState([])
  const recipeByProductId = useRef({})
  const productIdsByMaterialId = useRef({})

  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)
  const [stockByMaterial, setStockByMaterial] = useState({}) // material_id -> { average_cost, balance_quantity } của kho đang chọn

  useEffect(() => { loadRows(); loadRefs() }, [])

  async function loadRows() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('issue_receipts')
      .select('*, orders(order_code, revenue, status, note, order_date, warehouse_id, revenue_type_id, salesperson_id, order_details(product_id,quantity,selling_price,revenue)), issue_receipt_details(*)')
      .eq('issue_source', 'order')
      .order('issue_date', { ascending: false })
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [w, p, m, r, rd, sp, rt] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('products').select('id,product_code,product_name,unit,selling_price').eq('active', true),
      supabase.from('materials').select('id,material_code,material_name,unit').eq('active', true),
      supabase.from('recipes').select('id,product_id').eq('active', true),
      supabase.from('recipe_details').select('recipe_id,material_id,quantity'),
      supabase.from('salespersons').select('id,full_name').eq('active', true),
      supabase.from('revenue_types').select('id,name').eq('active', true),
    ])
    setWarehouses(w.data || [])
    setProducts(p.data || [])
    setMaterials(m.data || [])
    setSalespersons(sp.data || [])
    setRevenueTypes(rt.data || [])

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
  const materialById = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[m.id] = m })
    return map
  }, [materials])
  const productById = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[p.id] = p })
    return map
  }, [products])

  function resolveProduct(code) {
    if (!code) return null
    return productByCode[String(code).trim().toLowerCase()] || null
  }
  function resolveMaterial(code) {
    if (!code) return null
    return materialByCode[String(code).trim().toLowerCase()] || null
  }

  // Tải giá bình quân (Giá xuất kho) của toàn bộ NVL trong đúng Kho xuất đã
  // chọn — dùng để hiển thị trước cho nhân viên xem, KHÔNG dùng số này để ghi
  // sổ (lúc Ghi sổ, database tự lấy giá bình quân mới nhất tại đúng thời điểm đó).
  async function loadStockForWarehouse(warehouseId) {
    if (!warehouseId) { setStockByMaterial({}); return }
    const { data, error } = await supabase.from('current_stock').select('material_id,average_cost,balance_quantity').eq('warehouse_id', warehouseId)
    if (!error) {
      const map = {}
      ;(data || []).forEach((s) => { map[s.material_id] = s })
      setStockByMaterial(map)
    }
  }
  // Danh sách món GỢI Ý cho 1 NVL cụ thể — chỉ gồm các món có dùng NVL đó
  // trong Cost món, để hiện thành dropdown lựa chọn (không phải toàn bộ danh mục món).
  function getCandidateProducts(material) {
    if (!material) return []
    const ids = productIdsByMaterialId.current[material.id]
    if (!ids) return []
    return [...ids].map((id) => productById[id]).filter(Boolean)
  }

  function openCreate() {
    setStockByMaterial({})
    setCreating({
      header: { issue_no: genCode('PX'), order_code: genCode('DH'), issue_date: new Date().toISOString().slice(0, 10), warehouse_id: '', revenue_type_id: '', salesperson_id: '', note: '' },
      materialLines: Array.from({ length: 5 }, emptyMaterialLine),
      productSales: {}, // { [product_code]: { quantity, selling_price } } — tự sinh khi gán Món tương ứng ở lưới NVL
    })
  }

  // Chỉ sửa được phiếu đang ở trạng thái Nháp (chưa ghi sổ, chưa ảnh hưởng
  // tồn kho). Phiếu đã ghi sổ (POSTED) thì Huỷ phiếu rồi tạo lại.
  function openEdit(row) {
    const order = row.orders
    const materialLines = (row.issue_receipt_details || []).map((d) => {
      const mat = materials.find((m) => m.id === d.material_id)
      const prod = d.product_id ? products.find((p) => p.id === d.product_id) : null
      return { productCode: prod ? prod.product_code : '', code: mat ? mat.material_code : '', quantity: String(d.quantity ?? '') }
    })
    while (materialLines.length < 5) materialLines.push(emptyMaterialLine())

    const productSales = {}
    ;(order?.order_details || []).forEach((od) => {
      const prod = products.find((p) => p.id === od.product_id)
      if (prod) productSales[prod.product_code] = { quantity: String(od.quantity ?? ''), selling_price: String(od.selling_price ?? '') }
    })

    setCreating({
      id: row.id,
      orderId: row.order_id,
      header: {
        issue_no: row.issue_no,
        order_code: order?.order_code || genCode('DH'),
        issue_date: order?.order_date || new Date().toISOString().slice(0, 10),
        warehouse_id: row.warehouse_id || '',
        revenue_type_id: order?.revenue_type_id || '',
        salesperson_id: order?.salesperson_id || '',
        note: order?.note || '',
      },
      materialLines,
      productSales,
    })
    if (row.warehouse_id) loadStockForWarehouse(row.warehouse_id)
  }

  // Đảm bảo có 1 dòng "bán món" cho mã món này (tự thêm với SL=1 + giá bán
  // mặc định theo Danh mục nếu chưa có) — đây chính là dữ liệu dùng để tạo
  // Đơn hàng thật khi Lưu, và để nhân định lượng công thức khi tự nhảy NVL.
  function ensureProductSale(productSales, code) {
    const key = (code || '').trim()
    if (!key || productSales[key]) return productSales
    const product = resolveProduct(key)
    return { ...productSales, [key]: { quantity: '1', selling_price: product ? String(product.selling_price || 0) : '' } }
  }

  function updateProductSale(code, field, value) {
    setCreating((c) => ({ ...c, productSales: { ...c.productSales, [code]: { ...c.productSales[code], [field]: value } } }))
  }
  function removeProductSale(code) {
    setCreating((c) => {
      const productSales = { ...c.productSales }
      delete productSales[code]
      return { ...c, productSales }
    })
  }

  const productSaleEntries = Object.entries(creating?.productSales || {}).map(([code, v]) => ({
    code, product: resolveProduct(code), quantity: v.quantity, selling_price: v.selling_price,
  }))
  const totalRevenue = productSaleEntries.reduce((s, e) => s + (Number(e.quantity) || 0) * (Number(e.selling_price) || 0), 0)

  function selectAll(e) { e.target.select() }

  const matProductRefs = useRef([]); const matCodeRefs = useRef([]); const matQtyRefs = useRef([])
  const MAT_REFS_BY_COL = [matCodeRefs, matQtyRefs, matProductRefs] // 0=Mã NVL,1=SL,2=Món tương ứng (trái->phải)

  function updateMaterialLine(idx, field, value) {
    setCreating((c) => {
      const lines = [...c.materialLines]
      lines[idx] = { ...lines[idx], [field]: value }
      let productSales = c.productSales
      if (field === 'productCode') productSales = ensureProductSale(productSales, value)
      return { ...c, materialLines: lines, productSales }
    })
  }
  function addMaterialRows(n) { setCreating((c) => ({ ...c, materialLines: [...c.materialLines, ...Array.from({ length: n }, emptyMaterialLine)] })) }
  function removeMaterialLine(idx) { setCreating((c) => ({ ...c, materialLines: c.materialLines.filter((_, i) => i !== idx) })) }

  // Gán "Món tương ứng" ở 1 dòng -> CHỈ gán món cho đúng dòng đó, và cho các
  // dòng KHÁC đã gõ sẵn Mã NVL (nhưng chưa chọn Món) nếu đúng NVL đó thuộc
  // công thức món này — KHÔNG tự sinh thêm dòng mới, không đụng dòng trống hẳn.
  function expandRecipeForRow(idx, rawCode) {
    const product = resolveProduct(rawCode)
    if (!product) return
    const recipeLines = recipeByProductId.current[product.id]
    if (!recipeLines || recipeLines.length === 0) {
      setError(`Món "${product.product_name}" chưa có Cost món (công thức) — vào Cost món khai báo trước, hoặc tự gõ tay NVL cho dòng này.`)
      return
    }
    const recipeByCode = {} // material_code (lowercase) -> quantity định lượng/suất
    recipeLines.forEach((rl) => {
      const mat = materialById[rl.material_id]
      if (mat) recipeByCode[mat.material_code.trim().toLowerCase()] = rl.quantity
    })

    setCreating((c) => {
      const sale = c.productSales[rawCode.trim()]
      const soldQty = Number(sale?.quantity) || 0
      const lines = c.materialLines.map((l, i) => {
        if (i === idx) return { ...l, productCode: rawCode }
        if (l.productCode) return l // đã gán món khác rồi, không ghi đè
        if (!l.code) return l // dòng trống hẳn -> bỏ qua, không tự điền
        const codeNorm = l.code.trim().toLowerCase()
        const recipeQty = recipeByCode[codeNorm]
        if (recipeQty === undefined) return l // NVL này không thuộc công thức món này
        const updated = { ...l, productCode: rawCode }
        if (!l.quantity && soldQty > 0) {
          updated.quantity = String(Math.round(recipeQty * soldQty * 1000) / 1000)
        }
        return updated
      })
      return { ...c, materialLines: lines }
    })
    setError('')
  }

  // (Đã bỏ tự động điền Món khi gõ NVL — thay bằng danh sách gợi ý dropdown
  // ở chính ô "Món tương ứng" thông qua getCandidateProducts(), để nhân viên
  // tự chọn đúng món thay vì hệ thống tự nhảy 1 loạt món liên quan.)

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

  // Tính NVL cho TẤT CẢ món đang có trong bảng "Món trong phiếu xuất", cùng lúc.
  function computeMaterialNeeds() {
    setError('')
    if (productSaleEntries.length === 0) { setError('Chưa có món nào — gán "Món tương ứng" cho ít nhất 1 dòng NVL trước.'); return }
    const newLines = []
    const missingRecipe = []
    for (const e of productSaleEntries) {
      if (!e.product || !(Number(e.quantity) > 0)) continue
      const recipeLines = recipeByProductId.current[e.product.id]
      if (!recipeLines || recipeLines.length === 0) {
        missingRecipe.push(e.product.product_name)
        continue
      }
      recipeLines.forEach((rl) => {
        const mat = materialById[rl.material_id]
        newLines.push({
          productCode: e.product.product_code,
          code: mat ? mat.material_code : '',
          quantity: String(Math.round(rl.quantity * Number(e.quantity) * 1000) / 1000),
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
    if (!creating.header.warehouse_id) { setError('Chưa chọn Kho xuất.'); return }
    const validSales = productSaleEntries.filter((e) => e.product && Number(e.quantity) > 0)
    if (validSales.length === 0) { setError('Chưa có món nào hợp lệ (cần gán Món tương ứng + SL bán > 0).'); return }
    if (unresolvedMaterialCount > 0) { setError('Có dòng mã NVL không khớp danh mục — sửa hoặc xoá dòng đó.'); return }
    const validMaterialLines = resolvedMaterialLines.filter((l) => l.material && Number(l.quantity) > 0)
    if (validMaterialLines.length === 0) { setError('Chưa có dòng NVL nào để xuất.'); return }

    const orderPayload = {
      order_code: creating.header.order_code,
      order_date: creating.header.issue_date,
      warehouse_id: creating.header.warehouse_id,
      revenue_type_id: creating.header.revenue_type_id || null,
      salesperson_id: creating.header.salesperson_id || null,
      note: creating.header.note,
      status: 'DRAFT',
      revenue: totalRevenue,
    }

    setSaving(true)

    if (creating.id) {
      // SỬA phiếu Nháp có sẵn: cập nhật đơn hàng + phiếu xuất, xoá-ghi lại chi tiết
      const { error: eu1 } = await supabase.from('orders').update(orderPayload).eq('id', creating.orderId)
      if (eu1) { setError(eu1.message); setSaving(false); return }
      await supabase.from('order_details').delete().eq('order_id', creating.orderId)
      const { error: eu2 } = await supabase.from('order_details').insert(
        validSales.map((s) => ({
          order_id: creating.orderId, item_type: 'product', product_id: s.product.id,
          quantity: Number(s.quantity), selling_price: Number(s.selling_price) || 0,
          revenue: (Number(s.quantity) || 0) * (Number(s.selling_price) || 0),
        }))
      )
      if (eu2) { setError(eu2.message); setSaving(false); return }

      const { error: eu3 } = await supabase.from('issue_receipts').update({ warehouse_id: creating.header.warehouse_id, issue_date: creating.header.issue_date }).eq('id', creating.id)
      if (eu3) { setError(eu3.message); setSaving(false); return }
      await supabase.from('issue_receipt_details').delete().eq('issue_id', creating.id)
      const { error: eu4 } = await supabase.from('issue_receipt_details').insert(
        validMaterialLines.map((l) => ({
          issue_id: creating.id, material_id: l.material.id, product_id: l.product ? l.product.id : null, quantity: Number(l.quantity),
        }))
      )
      setSaving(false)
      if (eu4) { setError(eu4.message); return }
      setCreating(null)
      loadRows()
      return
    }

    // TẠO phiếu mới: tự tạo Đơn hàng thật đằng sau (không cần qua trang Đơn hàng trước)
    const { data: order, error: e1 } = await supabase
      .from('orders')
      .insert({ ...orderPayload, created_by: user.id })
      .select().single()
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('order_details').insert(
      validSales.map((s) => ({
        order_id: order.id, item_type: 'product', product_id: s.product.id,
        quantity: Number(s.quantity), selling_price: Number(s.selling_price) || 0,
        revenue: (Number(s.quantity) || 0) * (Number(s.selling_price) || 0),
      }))
    )
    if (e2) { setError(e2.message); setSaving(false); return }

    // 2) Tạo phiếu xuất kho gắn với đơn hàng vừa tạo
    const { data: issue, error: e3 } = await supabase
      .from('issue_receipts')
      .insert({ issue_no: creating.header.issue_no, issue_date: creating.header.issue_date, warehouse_id: creating.header.warehouse_id, issue_source: 'order', order_id: order.id, status: 'DRAFT' })
      .select().single()
    if (e3) { setError(e3.message); setSaving(false); return }

    const { error: e4 } = await supabase.from('issue_receipt_details').insert(
      validMaterialLines.map((l) => ({
        issue_id: issue.id,
        material_id: l.material.id,
        product_id: l.product ? l.product.id : null,
        quantity: Number(l.quantity),
      }))
    )
    setSaving(false)
    if (e4) { setError(e4.message); return }
    setCreating(null)
    loadRows()
  }

  function openPrint(row) {
    const warehouse = warehouses.find((w) => w.id === row.warehouse_id)
    const lines = (row.issue_receipt_details || []).map((d) => {
      const mat = materials.find((m) => m.id === d.material_id)
      const prod = d.product_id ? products.find((p) => p.id === d.product_id) : null
      return {
        code: mat?.material_code || '',
        name: (mat?.material_name || '') + (prod ? ` (${prod.product_code} - ${prod.product_name})` : ''),
        unit: mat?.unit || '',
        quantity: d.quantity,
        unitPrice: d.unit_cost,
        amount: d.amount,
      }
    })
    setPrinting({
      header: [
        { label: 'Số phiếu', value: row.issue_no },
        { label: 'Đơn hàng', value: row.orders?.order_code },
        { label: 'Kho xuất', value: warehouse?.name },
        { label: 'Doanh thu', value: row.orders?.revenue != null ? Number(row.orders.revenue).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : '' },
      ],
      lines,
    })
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
          <h1 className="text-xl font-semibold text-ink">{creating.id ? 'Sửa phiếu xuất' : 'Xuất kho'}</h1>
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
            <div><label className="block text-xs text-gray-500 mb-1">Số phiếu xuất</label>
              <input value={creating.header.issue_no} readOnly className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Ngày</label>
              <input type="date" value={creating.header.issue_date}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, issue_date: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Kho xuất *</label>
              <select value={creating.header.warehouse_id} required
                onChange={(e) => { setCreating({ ...creating, header: { ...creating.header, warehouse_id: e.target.value } }); loadStockForWarehouse(e.target.value) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Loại doanh thu</label>
              <select value={creating.header.revenue_type_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, revenue_type_id: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {revenueTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select></div>
            <div><label className="block text-xs text-gray-500 mb-1">Mã xuất (NVKD)</label>
              <select value={creating.header.salesperson_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, salesperson_id: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {salespersons.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select></div>
            <div className="md:col-span-3"><label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
              <input value={creating.header.note} onChange={(e) => setCreating({ ...creating, header: { ...creating.header, note: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm mb-4">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="text-sm text-gray-500">Món trong phiếu xuất này (tự thêm khi bạn gán "Món tương ứng" ở lưới NVL bên dưới) — hệ thống sẽ tự tạo Đơn hàng thật khi Lưu.</div>
            <div className="text-sm"><span className="text-gray-400">Doanh thu tạm tính: </span><span className="font-semibold text-ink">{totalRevenue.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</span></div>
          </div>
          {productSaleEntries.length === 0 ? (
            <div className="p-6 text-center text-sm text-gray-400">Chưa có món nào — xuống lưới NVL bên dưới, gõ mã NVL hoặc Món tương ứng để bắt đầu.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã món</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên món</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL bán</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Giá bán</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Doanh thu</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {productSaleEntries.map((s) => {
                  const revenue = (Number(s.quantity) || 0) * (Number(s.selling_price) || 0)
                  return (
                    <tr key={s.code} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5 font-medium text-ink">{s.code}</td>
                      <td className="px-3 py-1.5 text-gray-600">{s.product?.product_name || <span className="text-red-500 text-xs">Không tìm thấy mã món</span>}</td>
                      <td className="px-1 py-1">
                        <input type="text" inputMode="decimal" value={s.quantity}
                          onChange={(e) => updateProductSale(s.code, 'quantity', e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-1 py-1">
                        <input type="text" inputMode="decimal" value={s.selling_price}
                          onChange={(e) => updateProductSale(s.code, 'selling_price', e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium text-ink">{revenue > 0 ? revenue.toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : ''}</td>
                      <td className="px-2 py-1 text-center"><button onClick={() => removeProductSale(s.code)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <ClipboardPaste size={15} /> Gõ Mã NVL xong → ô "Món tương ứng" hiện gợi ý chỉ gồm món có dùng NVL đó. Chọn 1 món → chỉ gán cho dòng này + các dòng khác bạn đã gõ sẵn Mã NVL thuộc đúng công thức (không tự thêm dòng mới). SL bán của món sửa ở bảng trên. Muốn tự sinh đủ toàn bộ NVL theo công thức, dùng nút "Tính lại NVL cho tất cả món".
            </div>
            <div className="flex gap-3 items-center">
              <div className="text-sm">
                <span className="text-gray-400">Giá vốn tạm tính: </span>
                <span className="font-semibold text-ink">
                  {resolvedMaterialLines.reduce((sum, l) => {
                    const stock = l.material ? stockByMaterial[l.material.id] : null
                    const unitCost = stock ? Number(stock.average_cost) : 0
                    return sum + unitCost * (Number(l.quantity) || 0)
                  }, 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <button onClick={computeMaterialNeeds} className="inline-flex items-center gap-2 text-xs text-brand-600 hover:underline">
                <Calculator size={14} /> Tính lại NVL cho tất cả món
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
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Giá xuất kho</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Thành tiền</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-40">Món tương ứng</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {resolvedMaterialLines.map((l, idx) => {
                const invalid = l.code && !l.material
                const productInvalid = l.productCode && !l.product
                const candidateProducts = getCandidateProducts(l.material)
                const productListId = candidateProducts.length > 0 ? `products-suggest-${idx}` : 'products-datalist-xk-mat'
                const stock = l.material ? stockByMaterial[l.material.id] : null
                const unitCost = stock ? Number(stock.average_cost) : null
                const lineAmount = unitCost !== null ? unitCost * (Number(l.quantity) || 0) : null
                const notEnoughStock = stock && Number(l.quantity) > Number(stock.balance_quantity)
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-1 text-xs text-gray-400">{idx + 1}</td>
                    <td className="px-1 py-1">
                      <input
                        ref={(el) => (matCodeRefs.current[idx] = el)}
                        list="materials-datalist-xk" value={l.code}
                        onChange={(e) => updateMaterialLine(idx, 'code', e.target.value)}
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
                    <td className={`px-3 py-1.5 text-right ${notEnoughStock ? 'text-red-500' : 'text-gray-600'}`}>
                      {unitCost !== null ? Number(unitCost).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : (l.material ? <span className="text-gray-300 text-xs">Chưa có tồn</span> : '')}
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${notEnoughStock ? 'text-red-500' : 'text-ink'}`}>
                      {lineAmount !== null ? Number(lineAmount).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : ''}
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          ref={(el) => (matProductRefs.current[idx] = el)}
                          list={productListId} value={l.productCode}
                          onChange={(e) => updateMaterialLine(idx, 'productCode', e.target.value)}
                          onBlur={(e) => expandRecipeForRow(idx, e.target.value)}
                          onKeyDown={(e) => handleMatKeyDown(e, idx, 2)} onFocus={selectAll}
                          placeholder={candidateProducts.length > 0 ? 'Chọn món gợi ý...' : '(tuỳ chọn)'}
                          className={`w-full rounded-md border px-2 py-1.5 text-sm ${productInvalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                        <button type="button" tabIndex={-1} title="Thêm dòng NVL cho món này"
                          onClick={() => addMaterialRowForSameProduct(idx)}
                          className="shrink-0 text-brand-600 hover:bg-brand-50 rounded p-1"><Plus size={13} /></button>
                      </div>
                      {candidateProducts.length > 0 && (
                        <datalist id={`products-suggest-${idx}`}>
                          {candidateProducts.map((p) => <option key={p.id} value={p.product_code}>{p.product_name}</option>)}
                        </datalist>
                      )}
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

      {rows.length > 0 && (() => {
        const totalRevenue = rows.reduce((s, r) => s + Number(r.orders?.revenue || 0), 0)
        const postedCount = rows.filter((r) => r.status === 'POSTED').length
        return (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng số phiếu</div>
              <div className="text-lg font-semibold text-ink">{rows.length}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Đã ghi sổ</div>
              <div className="text-lg font-semibold text-ink">{postedCount}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng doanh thu</div>
              <div className="text-lg font-semibold text-ink">{totalRevenue.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        )
      })()}

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
                    <td className="px-4 py-3 whitespace-nowrap">{Number(r.orders?.revenue || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3">{(r.issue_receipt_details || []).length}</td>
                    <td className="px-4 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      <button onClick={() => openPrint(r)} className="inline-flex items-center gap-1 text-gray-500 hover:text-brand-600 mr-3 align-middle">
                        <Printer size={13} /> Xem/In
                      </button>
                      {busyId === r.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : r.status === 'DRAFT' ? (
                        <>
                          <button onClick={() => openEdit(r)} className="text-brand-600 hover:underline">Sửa</button>
                          <span className="text-gray-300 mx-1.5">|</span>
                          <button onClick={() => postRow(r)} className="text-green-600 font-medium hover:underline">Ghi sổ (cập nhật kho)</button>
                        </>
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
      {printing && (
        <PrintReceipt type="xuat" header={printing.header} lines={printing.lines} totalLabel="Tổng giá vốn NVL" onClose={() => setPrinting(null)} />
      )}
    </div>
  )
}
