import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2, Save, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

function emptyLine() {
  return { code: '', quantity: '1' }
}

export default function CostMam() {
  const [menus, setMenus] = useState([])
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [creatingMenu, setCreatingMenu] = useState(null) // header mới
  const [editingId, setEditingId] = useState(null) // id mâm đang sửa định lượng
  const [lines, setLines] = useState([emptyLine()])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [costByProduct, setCostByProduct] = useState({})

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [mn, p, w] = await Promise.all([
      supabase.from('menus').select('*, menu_details(*)').order('menu_name'),
      supabase.from('products').select('id,product_code,product_name,unit,selling_price').eq('active', true),
      supabase.from('warehouses').select('id,name').eq('active', true),
    ])
    setMenus(mn.data || [])
    setProducts(p.data || [])
    setWarehouses(w.data || [])
    if (w.data?.length && !selectedWarehouseId) setSelectedWarehouseId(w.data[0].id)
    setLoading(false)
  }

  const productByCode = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[String(p.product_code).trim().toLowerCase()] = p })
    return map
  }, [products])

  function resolveProduct(code) {
    if (!code) return null
    return productByCode[String(code).trim().toLowerCase()] || null
  }

  async function loadProductCost(productId) {
    if (costByProduct[productId] !== undefined || !selectedWarehouseId) return
    const { data } = await supabase.rpc('compute_theoretical_cost', { p_product_id: productId, p_warehouse_id: selectedWarehouseId })
    setCostByProduct((c) => ({ ...c, [productId]: data || 0 }))
  }

  useEffect(() => {
    menus.forEach((m) => (m.menu_details || []).forEach((d) => loadProductCost(d.product_id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menus, selectedWarehouseId])

  function menuCost(menu) {
    return (menu.menu_details || []).reduce((sum, d) => sum + (Number(costByProduct[d.product_id]) || 0) * Number(d.quantity), 0)
  }

  function openCreateMenu() {
    setCreatingMenu({ menu_code: '', menu_name: '', selling_price: '', standard_guests: '10' })
  }

  async function saveNewMenu(e) {
    e.preventDefault()
    setError('')
    if (!creatingMenu.menu_code || !creatingMenu.menu_name) { setError('Cần Mã mâm và Tên mâm.'); return }
    setSaving(true)
    const { error } = await supabase.from('menus').insert({
      menu_code: creatingMenu.menu_code,
      menu_name: creatingMenu.menu_name,
      selling_price: Number(creatingMenu.selling_price) || 0,
      standard_guests: Number(creatingMenu.standard_guests) || 10,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setCreatingMenu(null)
    loadAll()
  }

  function openEditLines(menu) {
    const ls = (menu.menu_details || []).map((d) => {
      const prod = products.find((p) => p.id === d.product_id)
      return { code: prod ? prod.product_code : '', quantity: String(d.quantity) }
    })
    setLines(ls.length ? ls : [emptyLine()])
    setEditingId(menu.id)
  }

  function updateLine(idx, field, value) {
    setLines((ls) => { const next = [...ls]; next[idx] = { ...next[idx], [field]: value }; return next })
  }
  function addLine() { setLines((ls) => [...ls, emptyLine()]) }
  function removeLine(idx) { setLines((ls) => ls.filter((_, i) => i !== idx)) }

  const resolvedLines = lines.map((l) => ({ ...l, product: resolveProduct(l.code) }))
  const unresolvedCount = resolvedLines.filter((l) => l.code && !l.product).length

  async function saveLines() {
    setError('')
    if (unresolvedCount > 0) { setError('Có dòng món gõ mã không khớp danh mục.'); return }
    const validLines = resolvedLines.filter((l) => l.product && Number(l.quantity) > 0)
    if (validLines.length === 0) { setError('Cần ít nhất 1 món trong mâm.'); return }
    setSaving(true)
    await supabase.from('menu_details').delete().eq('menu_id', editingId)
    const { error } = await supabase.from('menu_details').insert(
      validLines.map((l) => ({ menu_id: editingId, product_id: l.product.id, quantity: Number(l.quantity) }))
    )
    setSaving(false)
    if (error) { setError(error.message); return }
    setEditingId(null)
    setCostByProduct({})
    loadAll()
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Cost mâm / combo</h1>
          <p className="text-sm text-gray-400 mt-0.5">{menus.length} mâm — Cost mâm = tổng Cost các món trong mâm</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={selectedWarehouseId} onChange={(e) => { setSelectedWarehouseId(e.target.value); setCostByProduct({}) }}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button onClick={loadAll} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreateMenu} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Thêm mâm
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : menus.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có mâm nào. Bấm "Thêm mâm" để tạo.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Mã mâm</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Tên mâm</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Giá bán</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Cost mâm</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Lợi nhuận</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">% LN</th>
                <th className="px-4 py-3 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => {
                const cost = menuCost(m)
                const profit = Number(m.selling_price || 0) - cost
                const pct = m.selling_price > 0 ? (profit / m.selling_price) * 100 : 0
                return (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink">{m.menu_code}</td>
                    <td className="px-4 py-3">{m.menu_name}</td>
                    <td className="px-4 py-3 text-right">{Number(m.selling_price || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{cost.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{profit.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right">{pct.toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEditLines(m)} className="text-brand-600 hover:underline">Sửa món</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {creatingMenu && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <form onSubmit={saveNewMenu} className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Thêm mâm mới</h2>
              <button type="button" onClick={() => setCreatingMenu(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mã mâm *</label>
              <input value={creatingMenu.menu_code} onChange={(e) => setCreatingMenu({ ...creatingMenu, menu_code: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tên mâm *</label>
              <input value={creatingMenu.menu_name} onChange={(e) => setCreatingMenu({ ...creatingMenu, menu_name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" required />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Giá bán</label>
              <input type="number" value={creatingMenu.selling_price} onChange={(e) => setCreatingMenu({ ...creatingMenu, selling_price: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số khách tiêu chuẩn</label>
              <input type="number" value={creatingMenu.standard_guests} onChange={(e) => setCreatingMenu({ ...creatingMenu, standard_guests: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreatingMenu(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingId && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Danh sách món trong mâm</h2>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
            <div className="space-y-2">
              {resolvedLines.map((l, idx) => {
                const invalid = l.code && !l.product
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <input list="products-datalist-mam" value={l.code} onChange={(e) => updateLine(idx, 'code', e.target.value)}
                      placeholder="Mã món..." className={`col-span-7 rounded-md border px-2 py-1.5 text-sm ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                    <span className="col-span-2 text-xs text-gray-500 truncate">{l.product?.product_name || (invalid ? <span className="text-red-500">Không khớp</span> : '')}</span>
                    <input type="text" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                      className="col-span-2 rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" placeholder="SL" />
                    <button onClick={() => removeLine(idx)} className="col-span-1 text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                  </div>
                )
              })}
            </div>
            <datalist id="products-datalist-mam">
              {products.map((p) => <option key={p.id} value={p.product_code}>{p.product_name}</option>)}
            </datalist>
            <button onClick={addLine} className="text-xs text-brand-600 hover:underline">+ Thêm món</button>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setEditingId(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Đóng</button>
              <button onClick={saveLines} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
                <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu danh sách món'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
