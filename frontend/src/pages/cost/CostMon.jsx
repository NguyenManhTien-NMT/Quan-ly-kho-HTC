import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Loader2, Plus, Trash2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'

function emptyLine() {
  return { code: '', quantity: '' }
}

export default function CostMon() {
  const { user } = useAuth()
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [currentRecipe, setCurrentRecipe] = useState(null) // {version, cost_mode}
  const [theoreticalCost, setTheoreticalCost] = useState(null)
  const [history, setHistory] = useState([])

  useEffect(() => {
    loadRefs()
  }, [])

  useEffect(() => {
    if (selectedProductId) loadRecipe(selectedProductId)
  }, [selectedProductId])

  useEffect(() => {
    if (selectedProductId && selectedWarehouseId) computeCost()
  }, [selectedProductId, selectedWarehouseId, currentRecipe])

  async function loadRefs() {
    setLoading(true)
    const [p, m, w] = await Promise.all([
      supabase.from('products').select('id,product_code,product_name,unit').eq('active', true).order('product_name'),
      supabase.from('materials').select('id,material_code,material_name,unit').eq('active', true),
      supabase.from('warehouses').select('id,name').eq('active', true),
    ])
    setProducts(p.data || [])
    setMaterials(m.data || [])
    setWarehouses(w.data || [])
    if (w.data?.length) setSelectedWarehouseId(w.data[0].id)
    setLoading(false)
  }

  const materialByCode = useMemo(() => {
    const map = {}
    materials.forEach((m) => { map[String(m.material_code).trim().toLowerCase()] = m })
    return map
  }, [materials])

  function resolveMaterial(code) {
    if (!code) return null
    return materialByCode[String(code).trim().toLowerCase()] || null
  }

  async function loadRecipe(productId) {
    setError('')
    const { data: recipe, error: e1 } = await supabase
      .from('recipes').select('*').eq('product_id', productId).eq('active', true).maybeSingle()
    if (e1) { setError(e1.message); return }

    const { data: hist } = await supabase
      .from('recipes').select('version, effective_from, effective_to, active')
      .eq('product_id', productId).order('version', { ascending: false })
    setHistory(hist || [])

    if (!recipe) {
      setCurrentRecipe(null)
      setLines([emptyLine()])
      return
    }
    setCurrentRecipe(recipe)
    const { data: details } = await supabase.from('recipe_details').select('*').eq('recipe_id', recipe.id)
    const mats = materials.length ? materials : (await supabase.from('materials').select('id,material_code,material_name,unit')).data || []
    const newLines = (details || []).map((d) => {
      const mat = mats.find((m) => m.id === d.material_id)
      return { code: mat ? mat.material_code : '', quantity: String(d.quantity) }
    })
    setLines(newLines.length ? newLines : [emptyLine()])
  }

  async function computeCost() {
    const { data, error } = await supabase.rpc('compute_theoretical_cost', {
      p_product_id: selectedProductId,
      p_warehouse_id: selectedWarehouseId,
    })
    if (!error) setTheoreticalCost(data)
  }

  function updateLine(idx, field, value) {
    setLines((ls) => {
      const next = [...ls]
      next[idx] = { ...next[idx], [field]: value }
      return next
    })
  }
  function addLine() { setLines((ls) => [...ls, emptyLine()]) }
  function removeLine(idx) { setLines((ls) => ls.filter((_, i) => i !== idx)) }

  const resolvedLines = lines.map((l) => ({ ...l, material: resolveMaterial(l.code) }))
  const unresolvedCount = resolvedLines.filter((l) => l.code && !l.material).length

  async function handleSaveRecipe() {
    setError('')
    if (!selectedProductId) { setError('Chưa chọn món.'); return }
    if (unresolvedCount > 0) { setError('Có dòng NVL gõ mã không khớp danh mục.'); return }
    const validLines = resolvedLines.filter((l) => l.material && Number(l.quantity) > 0)
    if (validLines.length === 0) { setError('Cần ít nhất 1 dòng định lượng NVL hợp lệ.'); return }

    setSaving(true)
    const { error } = await supabase.rpc('save_recipe', {
      p_product_id: selectedProductId,
      p_cost_mode: 'dinh_muc',
      p_lines: validLines.map((l) => ({ material_id: l.material.id, quantity: Number(l.quantity) })),
      p_user_id: user.id,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    loadRecipe(selectedProductId)
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Cost món</h1>
          <p className="text-sm text-gray-400 mt-0.5">Định mức nguyên vật liệu cho từng món — sửa sẽ tạo version mới, giữ nguyên lịch sử.</p>
        </div>
        <button onClick={loadRefs} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Món ăn / thành phẩm</label>
          <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="">-- Chọn món --</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.product_name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tính giá theo kho (dùng giá bình quân NVL tại kho này)</label>
          <select value={selectedWarehouseId} onChange={(e) => setSelectedWarehouseId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </div>

      {selectedProductId && (
        <>
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm mb-4">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
              <div className="text-sm text-gray-500">
                {currentRecipe ? `Công thức hiện tại: version ${currentRecipe.version}` : 'Chưa có công thức — tạo mới bên dưới'}
              </div>
              <button onClick={addLine} className="text-xs text-brand-600 hover:underline">+ Thêm dòng NVL</button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-20">ĐVT</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Định lượng</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {resolvedLines.map((l, idx) => {
                  const invalid = l.code && !l.material
                  return (
                    <tr key={idx} className="border-b border-gray-50 last:border-0">
                      <td className="px-1 py-1">
                        <input list="materials-datalist-cost" value={l.code}
                          onChange={(e) => updateLine(idx, 'code', e.target.value)}
                          className={`w-full rounded-md border px-2 py-1.5 text-sm ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`} />
                      </td>
                      <td className="px-2 py-1 text-gray-600">{l.material?.material_name || (invalid ? <span className="text-red-500 text-xs">Không tìm thấy mã</span> : '')}</td>
                      <td className="px-2 py-1 text-gray-400 text-xs">{l.material?.unit || ''}</td>
                      <td className="px-1 py-1">
                        <input type="text" inputMode="decimal" value={l.quantity}
                          onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                      </td>
                      <td className="px-2 py-1 text-center">
                        <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <datalist id="materials-datalist-cost">
              {materials.map((m) => <option key={m.id} value={m.material_code}>{m.material_name}</option>)}
            </datalist>
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
              <div className="text-sm text-gray-500">
                Giá bán hiện tại: <span className="font-medium text-ink">{selectedProduct ? Number(selectedProduct.selling_price || 0).toLocaleString('vi-VN') : '—'}</span>
              </div>
              <button onClick={handleSaveRecipe} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700 disabled:opacity-60">
                <Save size={15} /> {saving ? 'Đang lưu...' : 'Lưu công thức (tạo version mới)'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-sm text-gray-500 mb-1">Cost lý thuyết (theo giá NVL bình quân hiện tại)</div>
              <div className="text-2xl font-semibold text-ink">
                {theoreticalCost !== null ? Number(theoreticalCost).toLocaleString('vi-VN') : '—'}
              </div>
              {selectedProduct && theoreticalCost !== null && (
                <div className="text-xs text-gray-400 mt-1">
                  Food cost: {((Number(theoreticalCost) / Number(selectedProduct.selling_price || 1)) * 100).toFixed(1)}%
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-sm text-gray-500 mb-2">Lịch sử công thức</div>
              {history.length === 0 ? (
                <div className="text-sm text-gray-400">Chưa có lịch sử.</div>
              ) : (
                <ul className="text-sm space-y-1">
                  {history.map((h) => (
                    <li key={h.version} className="flex justify-between">
                      <span>Version {h.version}{h.active && <span className="text-green-600"> (đang dùng)</span>}</span>
                      <span className="text-gray-400">{h.effective_from}{h.effective_to ? ` → ${h.effective_to}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
