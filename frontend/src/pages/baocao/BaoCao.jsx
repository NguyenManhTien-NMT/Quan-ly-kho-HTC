import { useEffect, useState } from 'react'
import { RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'

function firstDayOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function BaoCao() {
  const [tab, setTab] = useState('xnt') // xnt | loai | nguon
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [fromDate, setFromDate] = useState(firstDayOfMonth())
  const [toDate, setToDate] = useState(today())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState([])

  useEffect(() => {
    supabase.from('warehouses').select('id,name').eq('active', true).then(({ data }) => {
      setWarehouses(data || [])
      if (data?.length) setWarehouseId(data[0].id)
    })
  }, [])

  useEffect(() => {
    if (tab === 'xnt' && !warehouseId) return
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, warehouseId, fromDate, toDate])

  async function loadReport() {
    setLoading(true)
    setError('')
    let res
    if (tab === 'xnt') {
      res = await supabase.rpc('report_xnt', { p_warehouse_id: warehouseId, p_from_date: fromDate, p_to_date: toDate })
    } else if (tab === 'loai') {
      res = await supabase.rpc('report_revenue_by_type', { p_from_date: fromDate, p_to_date: toDate })
    } else {
      res = await supabase.rpc('report_revenue_by_salesperson', { p_from_date: fromDate, p_to_date: toDate })
    }
    if (res.error) setError(res.error.message)
    else setRows(res.data || [])
    setLoading(false)
  }

  const n = (v) => Number(v || 0).toLocaleString('vi-VN')

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Báo cáo</h1>
          <p className="text-sm text-gray-400 mt-0.5">Xuất-Nhập-Tồn, doanh thu theo loại hình và theo nguồn (NVKD)</p>
        </div>
        <button onClick={loadReport} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1 mb-4 border-b border-gray-100">
        {[
          ['xnt', 'Xuất - Nhập - Tồn'],
          ['loai', 'Doanh thu theo Loại hình'],
          ['nguon', 'Doanh thu theo Nguồn (NVKD)'],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${tab === key ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        {tab === 'xnt' && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kho</label>
            <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[160px]">
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Từ ngày</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Đến ngày</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      {rows.length > 0 && !loading && (
        tab === 'xnt' ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng tồn đầu (GT)</div>
              <div className="text-lg font-semibold text-ink">{n(rows.reduce((s, r) => s + Number(r.opening_value || 0), 0))}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng nhập (GT)</div>
              <div className="text-lg font-semibold text-green-600">{n(rows.reduce((s, r) => s + Number(r.in_value || 0), 0))}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng xuất (GT)</div>
              <div className="text-lg font-semibold text-red-500">{n(rows.reduce((s, r) => s + Number(r.out_value || 0), 0))}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng tồn cuối (GT) — {rows.length} NVL</div>
              <div className="text-lg font-semibold text-ink">{n(rows.reduce((s, r) => s + Number(r.closing_value || 0), 0))}</div>
            </div>
          </div>
        ) : (() => {
          const totalRevenue = rows.reduce((s, r) => s + Number(r.total_revenue || 0), 0)
          const totalCost = rows.reduce((s, r) => s + Number(r.total_cost || 0), 0)
          const totalProfit = rows.reduce((s, r) => s + Number(r.total_profit || 0), 0)
          const totalOrders = rows.reduce((s, r) => s + Number(r.order_count || 0), 0)
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-1">Tổng số đơn</div>
                <div className="text-lg font-semibold text-ink">{totalOrders}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-1">Tổng doanh thu</div>
                <div className="text-lg font-semibold text-ink">{n(totalRevenue)}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-1">Tổng giá vốn</div>
                <div className="text-lg font-semibold text-ink">{n(totalCost)}</div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs text-gray-400 mb-1">Tổng lợi nhuận</div>
                <div className="text-lg font-semibold text-green-600">{n(totalProfit)}</div>
              </div>
            </div>
          )
        })()
      )}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Không có dữ liệu trong kỳ đã chọn.</div>
        ) : tab === 'xnt' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Mã NVL</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Tên NVL</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-14">ĐVT</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Tồn đầu (SL)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Tồn đầu (GT)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Nhập (SL)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Nhập (GT)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Xuất (SL)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Xuất (GT)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Tồn cuối (SL)</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase text-right">Tồn cuối (GT)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.material_id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-3 py-1.5 font-medium text-ink whitespace-nowrap">{r.material_code}</td>
                  <td className="px-3 py-1.5">{r.material_name}</td>
                  <td className="px-3 py-1.5 text-gray-400 text-xs">{r.unit}</td>
                  <td className="px-3 py-1.5 text-right">{n(r.opening_qty)}</td>
                  <td className="px-3 py-1.5 text-right">{n(r.opening_value)}</td>
                  <td className="px-3 py-1.5 text-right text-green-600">{n(r.in_qty)}</td>
                  <td className="px-3 py-1.5 text-right text-green-600">{n(r.in_value)}</td>
                  <td className="px-3 py-1.5 text-right text-red-500">{n(r.out_qty)}</td>
                  <td className="px-3 py-1.5 text-right text-red-500">{n(r.out_value)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{n(r.closing_qty)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{n(r.closing_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs text-gray-400 uppercase">{tab === 'loai' ? 'Loại doanh thu' : 'Nhân viên kinh doanh'}</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase text-right">Số đơn</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase text-right">Doanh thu</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase text-right">Giá vốn</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase text-right">Lợi nhuận</th>
                <th className="px-4 py-3 text-xs text-gray-400 uppercase text-right">% LN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const revenue = Number(r.total_revenue || 0)
                const profit = Number(r.total_profit || 0)
                const pct = revenue > 0 ? (profit / revenue) * 100 : 0
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink">{r.revenue_type_name || r.salesperson_name}</td>
                    <td className="px-4 py-3 text-right">{r.order_count}</td>
                    <td className="px-4 py-3 text-right">{n(r.total_revenue)}</td>
                    <td className="px-4 py-3 text-right">{n(r.total_cost)}</td>
                    <td className="px-4 py-3 text-right">{n(r.total_profit)}</td>
                    <td className="px-4 py-3 text-right">{revenue > 0 ? pct.toFixed(1) + '%' : '—'}</td>
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
