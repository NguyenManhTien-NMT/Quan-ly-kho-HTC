import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Loader2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'

const STATUS_BADGE = {
  DRAFT: { label: 'Nháp', variant: 'gray' },
  POSTED: { label: 'Đã điều chỉnh', variant: 'green' },
}

function genCode() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `KK-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`
}

export default function KiemKe() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [warehouses, setWarehouses] = useState([])

  const [creating, setCreating] = useState(null) // { header:{stocktake_no, warehouse_id, note}, lines:[{material_id, code, name, unit, book_quantity, unit_cost, actual_quantity}] }
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRows(); loadRefs() }, [])

  async function loadRows() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('stocktakes')
      .select('*, stocktake_details(*)')
      .order('stocktake_date', { ascending: false })
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  async function loadRefs() {
    const { data } = await supabase.from('warehouses').select('id,name').eq('active', true)
    setWarehouses(data || [])
  }

  async function openCreate() {
    setCreating({
      header: { stocktake_no: genCode(), stocktake_date: new Date().toISOString().slice(0, 10), warehouse_id: '', note: '' },
      lines: [],
    })
  }

  async function loadStockForKiemKe(warehouseId) {
    setError('')
    const { data, error } = await supabase
      .from('current_stock')
      .select('material_id, balance_quantity, average_cost')
      .eq('warehouse_id', warehouseId)
    if (error) { setError(error.message); return }
    const materialIds = (data || []).map((s) => s.material_id)
    if (materialIds.length === 0) {
      setCreating((c) => ({ ...c, lines: [] }))
      setError('Kho này chưa có tồn kho nào (chưa nhập hàng lần nào).')
      return
    }
    const { data: mats } = await supabase.from('materials').select('id,material_code,material_name,unit').in('id', materialIds)
    const matById = {}
    ;(mats || []).forEach((m) => { matById[m.id] = m })
    const lines = data
      .filter((s) => matById[s.material_id])
      .map((s) => ({
        material_id: s.material_id,
        code: matById[s.material_id].material_code,
        name: matById[s.material_id].material_name,
        unit: matById[s.material_id].unit,
        book_quantity: Number(s.balance_quantity),
        unit_cost: Number(s.average_cost),
        actual_quantity: String(s.balance_quantity), // mặc định = sổ sách, nhân viên sửa lại theo thực đếm
      }))
      .sort((a, b) => a.code.localeCompare(b.code))
    setCreating((c) => ({ ...c, lines }))
  }

  function updateActualQty(idx, value) {
    setCreating((c) => {
      const lines = [...c.lines]
      lines[idx] = { ...lines[idx], actual_quantity: value }
      return { ...c, lines }
    })
  }

  const linesWithVariance = (creating?.lines || []).map((l) => ({
    ...l,
    variance: (Number(l.actual_quantity) || 0) - l.book_quantity,
  }))
  const varianceCount = linesWithVariance.filter((l) => l.variance !== 0).length
  const varianceValue = linesWithVariance.reduce((s, l) => s + l.variance * l.unit_cost, 0)

  async function handleSaveDraft(e) {
    e.preventDefault()
    setError('')
    if (!creating.header.warehouse_id) { setError('Chưa chọn Kho.'); return }
    if (!creating.lines.length) { setError('Chưa có dữ liệu NVL để kiểm kê — chọn Kho trước.'); return }
    setSaving(true)
    const { data: st, error: e1 } = await supabase
      .from('stocktakes')
      .insert({
        stocktake_no: creating.header.stocktake_no,
        stocktake_date: creating.header.stocktake_date,
        warehouse_id: creating.header.warehouse_id,
        note: creating.header.note,
        created_by: user.id,
        status: 'DRAFT',
      })
      .select().single()
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('stocktake_details').insert(
      creating.lines.map((l) => ({
        stocktake_id: st.id,
        material_id: l.material_id,
        book_quantity: l.book_quantity,
        actual_quantity: Number(l.actual_quantity) || 0,
        unit_cost: l.unit_cost,
        variance_value: ((Number(l.actual_quantity) || 0) - l.book_quantity) * l.unit_cost,
      }))
    )
    setSaving(false)
    if (e2) { setError(e2.message); return }
    setCreating(null)
    loadRows()
  }

  async function postRow(row) {
    const nonZero = (row.stocktake_details || []).filter((d) => Number(d.variance_quantity) !== 0)
    const msg = nonZero.length > 0
      ? `Ghi sổ phiếu kiểm kê ${row.stocktake_no}? Sẽ tự điều chỉnh tồn kho cho ${nonZero.length} NVL có chênh lệch, và lưu lại biên bản điều chỉnh.`
      : `Phiếu ${row.stocktake_no} không có chênh lệch nào — vẫn ghi nhận đã kiểm kê xong, không tạo điều chỉnh nào.`
    if (!confirm(msg)) return
    setBusyId(row.id)
    setError('')
    const { error } = await supabase.rpc('finalize_stocktake', { p_stocktake_id: row.id, p_user_id: user.id })
    setBusyId(null)
    if (error) setError(error.message)
    else loadRows()
  }

  if (creating) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-ink">Kiểm kê / Điều chỉnh tồn kho</h1>
          <div className="flex gap-2">
            <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
            <button onClick={handleSaveDraft} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu phiếu kiểm kê'}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

        <div className="rounded-xl border border-gray-100 bg-white p-5 mb-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div><label className="block text-xs text-gray-500 mb-1">Số phiếu</label>
              <input value={creating.header.stocktake_no} readOnly className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Ngày kiểm kê</label>
              <input type="date" value={creating.header.stocktake_date}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, stocktake_date: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
            <div><label className="block text-xs text-gray-500 mb-1">Kho kiểm kê *</label>
              <select value={creating.header.warehouse_id} required
                onChange={(e) => { setCreating({ ...creating, header: { ...creating.header, warehouse_id: e.target.value } }); loadStockForKiemKe(e.target.value) }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></div>
            <div className="md:col-span-3"><label className="block text-xs text-gray-500 mb-1">Ghi chú</label>
              <input value={creating.header.note} onChange={(e) => setCreating({ ...creating, header: { ...creating.header, note: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          </div>
        </div>

        {creating.lines.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50 text-sm">
              <div className="text-gray-500">{creating.lines.length} NVL đang có tồn trong kho này</div>
              <div className={varianceCount > 0 ? 'text-red-500' : 'text-gray-400'}>
                {varianceCount} NVL có chênh lệch{varianceCount > 0 && ` · Giá trị chênh lệch: ${varianceValue.toLocaleString('vi-VN')}`}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-16">ĐVT</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL sổ sách</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">SL thực tế</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">Chênh lệch</th>
                  <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Giá trị CL</th>
                </tr>
              </thead>
              <tbody>
                {linesWithVariance.map((l, idx) => (
                  <tr key={l.material_id} className={`border-b border-gray-50 last:border-0 ${l.variance !== 0 ? 'bg-red-50/40' : ''}`}>
                    <td className="px-3 py-1.5 font-medium text-ink">{l.code}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.name}</td>
                    <td className="px-3 py-1.5 text-gray-400 text-xs">{l.unit}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{l.book_quantity.toLocaleString('vi-VN')}</td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" value={l.actual_quantity}
                        onChange={(e) => updateActualQty(idx, e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right font-medium" />
                    </td>
                    <td className={`px-3 py-1.5 text-right font-medium ${l.variance > 0 ? 'text-green-600' : l.variance < 0 ? 'text-red-500' : 'text-gray-300'}`}>
                      {l.variance !== 0 ? (l.variance > 0 ? '+' : '') + l.variance.toLocaleString('vi-VN') : '—'}
                    </td>
                    <td className={`px-3 py-1.5 text-right ${l.variance !== 0 ? 'text-red-500' : 'text-gray-300'}`}>
                      {l.variance !== 0 ? (l.variance * l.unit_cost).toLocaleString('vi-VN') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Kiểm kê / Điều chỉnh tồn kho</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rows.length} phiếu</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadRows} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Tạo phiếu kiểm kê
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có phiếu kiểm kê nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số phiếu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Ngày</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số NVL kiểm</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Số NVL chênh lệch</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Trạng thái</th>
                <th className="px-4 py-3 w-56"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const varCount = (r.stocktake_details || []).filter((d) => Number(d.variance_quantity) !== 0).length
                const badge = STATUS_BADGE[r.status] || STATUS_BADGE.DRAFT
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{r.stocktake_no}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{r.stocktake_date}</td>
                    <td className="px-4 py-3">{(r.stocktake_details || []).length}</td>
                    <td className="px-4 py-3">{varCount > 0 ? <span className="text-red-500">{varCount}</span> : '0'}</td>
                    <td className="px-4 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      {busyId === r.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : r.status === 'DRAFT' ? (
                        <button onClick={() => postRow(r)} className="inline-flex items-center gap-1 text-green-600 font-medium hover:underline">
                          <Save size={13} /> Cập nhật (điều chỉnh kho)
                        </button>
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
