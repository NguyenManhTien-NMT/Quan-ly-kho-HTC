import { useEffect, useMemo, useState } from 'react'
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Package, DollarSign } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { supabase } from '../lib/supabaseClient'

function firstDayOfMonth() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function Dashboard() {
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [fromDate, setFromDate] = useState(firstDayOfMonth())
  const [toDate, setToDate] = useState(today())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [stockValue, setStockValue] = useState(null)

  useEffect(() => {
    supabase.from('warehouses').select('id,name').eq('active', true).then(({ data }) => {
      setWarehouses(data || [])
      if (data?.length) setWarehouseId(data[0].id)
    })
    supabase.from('products').select('id,product_code,product_name').eq('active', true).then(({ data }) => setProducts(data || []))
  }, [])

  useEffect(() => {
    if (!warehouseId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, fromDate, toDate])

  async function loadData() {
    setLoading(true)
    setError('')
    const [ordersRes, stockRes] = await Promise.all([
      supabase
        .from('orders')
        .select('id, order_date, revenue, status, order_details(product_id, quantity, revenue, cost, profit)')
        .eq('warehouse_id', warehouseId)
        .gte('order_date', fromDate)
        .lte('order_date', toDate)
        .neq('status', 'CANCELLED'),
      supabase.from('current_stock').select('balance_value').eq('warehouse_id', warehouseId),
    ])
    if (ordersRes.error) setError(ordersRes.error.message)
    else setOrders(ordersRes.data || [])
    if (!stockRes.error) {
      setStockValue((stockRes.data || []).reduce((s, r) => s + Number(r.balance_value || 0), 0))
    }
    setLoading(false)
  }

  const productById = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[p.id] = p })
    return map
  }, [products])

  const kpi = useMemo(() => {
    let revenue = 0, cost = 0, profit = 0
    orders.forEach((o) => {
      (o.order_details || []).forEach((d) => {
        revenue += Number(d.revenue || 0)
        cost += Number(d.cost || 0)
        profit += Number(d.profit || 0)
      })
    })
    const foodCostPct = revenue > 0 ? (cost / revenue) * 100 : 0
    return { revenue, cost, profit, foodCostPct, orderCount: orders.length }
  }, [orders])

  const chartData = useMemo(() => {
    const byDay = {}
    orders.forEach((o) => {
      const day = o.order_date
      if (!byDay[day]) byDay[day] = { date: day, revenue: 0, cost: 0, profit: 0 }
      ;(o.order_details || []).forEach((d) => {
        byDay[day].revenue += Number(d.revenue || 0)
        byDay[day].cost += Number(d.cost || 0)
        byDay[day].profit += Number(d.profit || 0)
      })
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
  }, [orders])

  const topProducts = useMemo(() => {
    const map = {}
    orders.forEach((o) => {
      ;(o.order_details || []).forEach((d) => {
        if (!d.product_id) return
        if (!map[d.product_id]) map[d.product_id] = { quantity: 0, revenue: 0 }
        map[d.product_id].quantity += Number(d.quantity || 0)
        map[d.product_id].revenue += Number(d.revenue || 0)
      })
    })
    return Object.entries(map)
      .map(([productId, v]) => ({ product: productById[productId], ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
  }, [orders, productById])

  const n = (v) => Number(v || 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">Tổng quan doanh thu, giá vốn, food cost và tồn kho</p>
        </div>
        <button onClick={loadData} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex flex-wrap gap-3 mb-5 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kho</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm min-w-[160px]">
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
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

      {loading ? (
        <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Số đơn</div>
              <div className="text-lg font-semibold text-ink">{kpi.orderCount}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1"><TrendingUp size={13} /> Doanh thu</div>
              <div className="text-lg font-semibold text-ink">{n(kpi.revenue)}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1"><TrendingDown size={13} /> Giá vốn</div>
              <div className="text-lg font-semibold text-ink">{n(kpi.cost)}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1"><DollarSign size={13} /> Lợi nhuận</div>
              <div className={`text-lg font-semibold ${kpi.profit >= 0 ? 'text-green-600' : 'text-red-500'}`}>{n(kpi.profit)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">Food cost {kpi.foodCostPct.toFixed(1)}%</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-1"><Package size={13} /> Tồn kho hiện tại (GT)</div>
              <div className="text-lg font-semibold text-ink">{stockValue !== null ? n(stockValue) : '—'}</div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm mb-5">
            <div className="text-sm font-medium text-ink mb-3">Doanh thu / Giá vốn / Lợi nhuận theo ngày</div>
            {chartData.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-10">Không có đơn hàng trong kỳ đã chọn.</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f1f1" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1000000).toFixed(1) + 'tr'} />
                  <Tooltip formatter={(v) => Number(v).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} />
                  <Line type="monotone" dataKey="revenue" name="Doanh thu" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="cost" name="Giá vốn" stroke="#ef4444" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" name="Lợi nhuận" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <div className="px-5 py-3 border-b border-gray-50 text-sm font-medium text-ink">Top món bán chạy (theo doanh thu)</div>
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-400">Chưa có dữ liệu món trong kỳ này.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-2 text-xs text-gray-400 uppercase">Món</th>
                    <th className="px-4 py-2 text-xs text-gray-400 uppercase text-right">SL bán</th>
                    <th className="px-4 py-2 text-xs text-gray-400 uppercase text-right">Doanh thu</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((t, idx) => (
                    <tr key={idx} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2">{t.product?.product_name || t.product?.product_code || '—'}</td>
                      <td className="px-4 py-2 text-right">{n(t.quantity)}</td>
                      <td className="px-4 py-2 text-right font-medium">{n(t.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
