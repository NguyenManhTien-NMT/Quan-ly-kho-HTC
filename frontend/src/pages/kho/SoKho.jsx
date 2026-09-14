import { useEffect, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

const TXN_LABEL = {
  OPENING: 'Tồn đầu kỳ',
  PURCHASE: 'Nhập kho',
  ISSUE: 'Xuất kho',
  RETURN_IN: 'Nhập trả',
  RETURN_OUT: 'Xuất trả',
  ADJUSTMENT_IN: 'Điều chỉnh tăng',
  ADJUSTMENT_OUT: 'Điều chỉnh giảm',
  STOCKTAKE: 'Kiểm kê',
  TRANSFER_IN: 'Chuyển kho đến',
  TRANSFER_OUT: 'Chuyển kho đi',
}

export default function SoKho() {
  const [tab, setTab] = useState('ton') // 'ton' | 'lich_su'
  const [warehouses, setWarehouses] = useState([])
  const [materials, setMaterials] = useState([])
  const [stock, setStock] = useState([])
  const [loadingStock, setLoadingStock] = useState(true)

  const [selMaterial, setSelMaterial] = useState('')
  const [selWarehouse, setSelWarehouse] = useState('')
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadRefs()
    loadStock()
  }, [])

  async function loadRefs() {
    const [w, m] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('materials').select('id,material_code,material_name,unit'),
    ])
    setWarehouses(w.data || [])
    setMaterials(m.data || [])
  }

  async function loadStock() {
    setLoadingStock(true)
    setError('')
    const { data, error } = await supabase.from('current_stock').select('*')
    if (error) setError(error.message)
    else setStock(data || [])
    setLoadingStock(false)
  }

  async function loadHistory() {
    if (!selMaterial || !selWarehouse) {
      setError('Chọn Kho và Nguyên vật liệu trước.')
      return
    }
    setLoadingHistory(true)
    setError('')
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('material_id', selMaterial)
      .eq('warehouse_id', selWarehouse)
      .order('transaction_date', { ascending: true })
    if (error) setError(error.message)
    else setHistory(data || [])
    setLoadingHistory(false)
  }

  function matLabel(id) {
    const m = materials.find((x) => x.id === id)
    return m ? `${m.material_code} — ${m.material_name}` : id
  }
  function whLabel(id) {
    return warehouses.find((w) => w.id === id)?.name || id
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Sổ kho</h1>
          <p className="text-sm text-gray-400 mt-0.5">Tồn kho hiện tại &amp; lịch sử nhập-xuất-tồn theo từng NVL</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100">
        <button
          onClick={() => setTab('ton')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'ton' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'}`}
        >
          Tồn kho hiện tại
        </button>
        <button
          onClick={() => setTab('lich_su')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === 'lich_su' ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'}`}
        >
          Lịch sử theo NVL
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      {tab === 'ton' && (
        <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
          <div className="flex justify-end p-2 border-b border-gray-50">
            <button onClick={loadStock} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
              <RefreshCw size={16} className={loadingStock ? 'animate-spin' : ''} />
            </button>
          </div>
          {loadingStock ? (
            <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
          ) : stock.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Chưa có giao dịch kho nào (chưa nhập hàng).</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left">
                  <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">NVL</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Kho</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Tồn SL</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Giá BQ</th>
                  <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Giá trị tồn</th>
                </tr>
              </thead>
              <tbody>
                {stock.map((s, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3">{matLabel(s.material_id)}</td>
                    <td className="px-4 py-3">{whLabel(s.warehouse_id)}</td>
                    <td className="px-4 py-3 text-right">{Number(s.balance_quantity).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3 text-right">{Number(s.average_cost).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-3 text-right font-medium">{Number(s.balance_value).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'lich_su' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-4 items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kho</label>
              <select value={selWarehouse} onChange={(e) => setSelWarehouse(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[160px]">
                <option value="">-- Chọn kho --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nguyên vật liệu</label>
              <select value={selMaterial} onChange={(e) => setSelMaterial(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[240px]">
                <option value="">-- Chọn NVL --</option>
                {materials.map((m) => <option key={m.id} value={m.id}>{m.material_code} — {m.material_name}</option>)}
              </select>
            </div>
            <button onClick={loadHistory} className="rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
              Xem sổ kho
            </button>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
            {loadingHistory ? (
              <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
            ) : history.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400">Chọn Kho + NVL rồi bấm "Xem sổ kho".</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Ngày</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Loại GD</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">SL nhập</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">SL xuất</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Đơn giá</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Tồn SL</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Giá BQ</th>
                    <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase text-right">Giá trị tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(h.transaction_date).toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{TXN_LABEL[h.transaction_type] || h.transaction_type}</td>
                      <td className="px-4 py-3 text-right">{Number(h.quantity_in) > 0 ? Number(h.quantity_in).toLocaleString('vi-VN') : ''}</td>
                      <td className="px-4 py-3 text-right">{Number(h.quantity_out) > 0 ? Number(h.quantity_out).toLocaleString('vi-VN') : ''}</td>
                      <td className="px-4 py-3 text-right">{h.unit_cost ? Number(h.unit_cost).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) : ''}</td>
                      <td className="px-4 py-3 text-right">{Number(h.balance_quantity).toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-3 text-right">{Number(h.average_cost).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-3 text-right font-medium">{Number(h.balance_value).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
