import { useEffect, useMemo, useState } from 'react'
import { Plus, RefreshCw, Loader2, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import Badge from '../../components/Badge'

const STATUS_BADGE = {
  DRAFT: { label: 'Nháp', variant: 'gray' },
  POSTED: { label: 'Đã xuất kho', variant: 'green' },
  CANCELLED: { label: 'Đã huỷ', variant: 'red' },
}

function genOrderCode() {
  const d = new Date()
  const ymd = d.toISOString().slice(0, 10).replace(/-/g, '')
  return `DH-${ymd}-${Math.floor(Math.random() * 9000 + 1000)}`
}

function emptyLine() {
  return { itemType: 'product', code: '', quantity: '1', selling_price: '', discount: '0' }
}

export default function DonHang() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warehouses, setWarehouses] = useState([])
  const [customers, setCustomers] = useState([])
  const [salespersons, setSalespersons] = useState([])
  const [revenueTypes, setRevenueTypes] = useState([])
  const [products, setProducts] = useState([])
  const [menus, setMenus] = useState([])
  const [creating, setCreating] = useState(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    loadOrders()
    loadRefs()
  }, [])

  async function loadOrders() {
    setLoading(true)
    setError('')
    const { data, error } = await supabase
      .from('orders')
      .select('*, order_details(*), issue_receipts(id,status)')
      .order('order_date', { ascending: false })
    if (error) setError(error.message)
    else setOrders(data || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [w, c, s, rt, p, m] = await Promise.all([
      supabase.from('warehouses').select('id,name').eq('active', true),
      supabase.from('customers').select('id,customer_code,customer_name').eq('active', true),
      supabase.from('salespersons').select('id,full_name').eq('active', true),
      supabase.from('revenue_types').select('id,name').eq('active', true),
      supabase.from('products').select('id,product_code,product_name,selling_price').eq('active', true),
      supabase.from('menus').select('id,menu_code,menu_name,selling_price').eq('active', true),
    ])
    setWarehouses(w.data || [])
    setCustomers(c.data || [])
    setSalespersons(s.data || [])
    setRevenueTypes(rt.data || [])
    setProducts(p.data || [])
    setMenus(m.data || [])
  }

  const productByCode = useMemo(() => {
    const map = {}
    products.forEach((p) => { map[String(p.product_code).trim().toLowerCase()] = p })
    return map
  }, [products])
  const menuByCode = useMemo(() => {
    const map = {}
    menus.forEach((m) => { map[String(m.menu_code).trim().toLowerCase()] = m })
    return map
  }, [menus])

  function resolveItem(line) {
    if (!line.code) return null
    const key = String(line.code).trim().toLowerCase()
    return line.itemType === 'product' ? (productByCode[key] || null) : (menuByCode[key] || null)
  }

  function openCreate() {
    setCreating({
      header: {
        order_code: genOrderCode(),
        order_date: new Date().toISOString().slice(0, 10),
        customer_id: '',
        salesperson_id: '',
        revenue_type_id: '',
        warehouse_id: '',
        note: '',
      },
      lines: [emptyLine()],
    })
  }

  function updateLine(idx, field, value) {
    setCreating((c) => {
      const lines = [...c.lines]
      lines[idx] = { ...lines[idx], [field]: value }
      if (field === 'itemType') { lines[idx].code = ''; lines[idx].selling_price = '' }
      return { ...c, lines }
    })
  }

  function onPickItem(idx, code) {
    setCreating((c) => {
      const lines = [...c.lines]
      const line = { ...lines[idx], code }
      const key = code.trim().toLowerCase()
      const item = line.itemType === 'product' ? productByCode[key] : menuByCode[key]
      if (item) line.selling_price = String(item.selling_price)
      lines[idx] = line
      return { ...c, lines }
    })
  }

  function addLine() { setCreating((c) => ({ ...c, lines: [...c.lines, emptyLine()] })) }
  function removeLine(idx) { setCreating((c) => ({ ...c, lines: c.lines.filter((_, i) => i !== idx) })) }

  const resolvedLines = (creating?.lines || []).map((l) => ({ ...l, item: resolveItem(l) }))
  const totalRevenue = resolvedLines.reduce((sum, l) => {
    const rev = (Number(l.quantity) || 0) * (Number(l.selling_price) || 0) - (Number(l.discount) || 0)
    return sum + rev
  }, 0)
  const unresolvedCount = resolvedLines.filter((l) => l.code && !l.item).length
  const validCount = resolvedLines.filter((l) => l.item && Number(l.quantity) > 0).length

  async function handleSaveDraft(e) {
    e.preventDefault()
    setError('')
    if (unresolvedCount > 0) { setError(`Có ${unresolvedCount} dòng mã món/mâm không khớp danh mục.`); return }
    const validLines = resolvedLines.filter((l) => l.item && Number(l.quantity) > 0)
    if (validLines.length === 0) { setError('Cần ít nhất 1 dòng món/mâm hợp lệ.'); return }
    if (!creating.header.warehouse_id) { setError('Chưa chọn Kho xuất.'); return }

    setSaving(true)
    const { data: order, error: e1 } = await supabase
      .from('orders')
      .insert({ ...creating.header, created_by: user.id, status: 'DRAFT', revenue: totalRevenue })
      .select().single()
    if (e1) { setError(e1.message); setSaving(false); return }

    const { error: e2 } = await supabase.from('order_details').insert(
      validLines.map((l) => {
        const revenue = (Number(l.quantity) || 0) * (Number(l.selling_price) || 0) - (Number(l.discount) || 0)
        return {
          order_id: order.id,
          item_type: l.itemType,
          product_id: l.itemType === 'product' ? l.item.id : null,
          menu_id: l.itemType === 'menu' ? l.item.id : null,
          quantity: Number(l.quantity),
          selling_price: Number(l.selling_price) || 0,
          discount: Number(l.discount) || 0,
          revenue,
        }
      })
    )
    setSaving(false)
    if (e2) { setError(e2.message); return }
    setCreating(null)
    loadOrders()
  }

  // Xác nhận đơn: sinh phiếu xuất tự động theo Cost + ghi sổ ngay (đơn giản
  // hoá theo đúng yêu cầu trước đó — bỏ bước duyệt trung gian).
  async function confirmAndIssue(order) {
    if (!confirm(`Xác nhận đơn ${order.order_code}? Hệ thống sẽ tự sinh phiếu xuất kho theo Cost món và ghi sổ ngay.`)) return
    setBusyId(order.id)
    setError('')
    const issueNo = `PX-${order.order_code}`
    const { data: issueId, error: e1 } = await supabase.rpc('generate_issue_from_order', {
      p_order_id: order.id, p_user_id: user.id, p_issue_no: issueNo,
    })
    if (e1) { setError(e1.message); setBusyId(null); return }
    const { error: e2 } = await supabase.rpc('post_issue_receipt', { p_issue_id: issueId, p_user_id: user.id })
    if (e2) { setError(e2.message); setBusyId(null); return }
    await supabase.from('orders').update({ status: 'POSTED', posted_at: new Date().toISOString() }).eq('id', order.id)
    setBusyId(null)
    loadOrders()
  }

  async function cancelOrder(order) {
    const reason = prompt(`Nhập lý do huỷ đơn ${order.order_code}:`)
    if (reason === null) return
    if (!reason.trim()) { setError('Cần nhập lý do huỷ.'); return }
    const postedIssue = (order.issue_receipts || []).find((ir) => ir.status === 'POSTED')
    if (!postedIssue) { setError('Không tìm thấy phiếu xuất đã ghi sổ để hoàn tác.'); return }
    setBusyId(order.id)
    setError('')
    const { error } = await supabase.rpc('cancel_issue_receipt', {
      p_issue_id: postedIssue.id, p_user_id: user.id, p_reason: reason.trim(),
    })
    setBusyId(null)
    if (error) setError(error.message)
    else loadOrders()
  }

  if (creating) {
    return (
      <div className="p-6 md:p-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold text-ink">Tạo đơn hàng</h1>
          <div className="flex gap-2">
            <button onClick={() => setCreating(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
            <button onClick={handleSaveDraft} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
              {saving ? 'Đang lưu...' : 'Lưu đơn'}
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

        <div className="rounded-xl border border-gray-100 bg-white p-5 mb-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mã đơn</label>
              <input value={creating.header.order_code} readOnly className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-gray-50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Ngày</label>
              <input type="date" value={creating.header.order_date}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, order_date: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Kho xuất *</label>
              <select value={creating.header.warehouse_id} required
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, warehouse_id: e.target.value } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Khách hàng</label>
              <select value={creating.header.customer_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, customer_id: e.target.value || null } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.customer_code} — {c.customer_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Nhân viên kinh doanh</label>
              <select value={creating.header.salesperson_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, salesperson_id: e.target.value || null } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {salespersons.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Loại doanh thu</label>
              <select value={creating.header.revenue_type_id}
                onChange={(e) => setCreating({ ...creating, header: { ...creating.header, revenue_type_id: e.target.value || null } })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <option value="">-- Chọn --</option>
                {revenueTypes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
            <div className="text-sm text-gray-500">Chi tiết món / mâm</div>
            <button onClick={addLine} className="text-xs text-brand-600 hover:underline">+ Thêm dòng</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28">Loại</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase">Món / Mâm</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-24 text-right">SL</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Giá bán</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-28 text-right">Giảm giá</th>
                <th className="px-3 py-2 text-xs text-gray-400 uppercase w-32 text-right">Doanh thu</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {resolvedLines.map((l, idx) => {
                const revenue = (Number(l.quantity) || 0) * (Number(l.selling_price) || 0) - (Number(l.discount) || 0)
                const invalid = l.code && !l.item
                return (
                  <tr key={idx} className="border-b border-gray-50 last:border-0">
                    <td className="px-2 py-1">
                      <select value={l.itemType} onChange={(e) => updateLine(idx, 'itemType', e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm">
                        <option value="product">Món</option>
                        <option value="menu">Mâm</option>
                      </select>
                    </td>
                    <td className="px-1 py-1">
                      <input list={l.itemType === 'product' ? 'products-datalist' : 'menus-datalist'} value={l.code}
                        onChange={(e) => onPickItem(idx, e.target.value)}
                        className={`w-full rounded-md border px-2 py-1.5 text-sm ${invalid ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
                        placeholder="Gõ mã..." />
                      {invalid && <div className="text-xs text-red-500">Không tìm thấy mã</div>}
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(idx, 'quantity', e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" value={l.selling_price} onChange={(e) => updateLine(idx, 'selling_price', e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                    </td>
                    <td className="px-1 py-1">
                      <input type="text" inputMode="decimal" value={l.discount} onChange={(e) => updateLine(idx, 'discount', e.target.value)}
                        className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm text-right" />
                    </td>
                    <td className="px-3 py-1 text-right font-medium text-ink">{revenue > 0 ? revenue.toLocaleString('vi-VN') : ''}</td>
                    <td className="px-2 py-1 text-center">
                      <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="products-datalist">
            {products.map((p) => <option key={p.id} value={p.product_code}>{p.product_name}</option>)}
          </datalist>
          <datalist id="menus-datalist">
            {menus.map((m) => <option key={m.id} value={m.menu_code}>{m.menu_name}</option>)}
          </datalist>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm">
            <div className="text-gray-500">
              {validCount} dòng hợp lệ{unresolvedCount > 0 && <span className="text-red-500"> · {unresolvedCount} dòng không khớp</span>}
            </div>
            <div className="font-medium text-ink">Tổng doanh thu: {totalRevenue.toLocaleString('vi-VN')}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Đơn hàng / Doanh thu</h1>
          <p className="text-sm text-gray-400 mt-0.5">{orders.length} đơn</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadOrders} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Tạo đơn hàng
          </button>
        </div>
      </div>

      {orders.length > 0 && (() => {
        const totalRevenue = orders.reduce((s, o) => s + Number(o.revenue || 0), 0)
        const totalCost = orders.reduce((s, o) => s + (o.order_details || []).reduce((s2, d) => s2 + Number(d.cost || 0), 0), 0)
        const totalProfit = totalRevenue - totalCost
        return (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng doanh thu ({orders.length} đơn)</div>
              <div className="text-lg font-semibold text-ink">{totalRevenue.toLocaleString('vi-VN')}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng giá vốn</div>
              <div className="text-lg font-semibold text-ink">{totalCost.toLocaleString('vi-VN')}</div>
            </div>
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              <div className="text-xs text-gray-400 mb-1">Tổng lợi nhuận</div>
              <div className="text-lg font-semibold text-green-600">{totalProfit.toLocaleString('vi-VN')}</div>
            </div>
          </div>
        )
      })()}

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có đơn hàng nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Mã đơn</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Ngày</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Mã xuất (NVKD)</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Loại doanh thu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Doanh thu</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Giá vốn</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Lợi nhuận</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Trạng thái</th>
                <th className="px-4 py-3 w-56"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cost = (o.order_details || []).reduce((s, d) => s + Number(d.cost || 0), 0)
                const profit = (o.order_details || []).reduce((s, d) => s + Number(d.profit || 0), 0)
                const badge = STATUS_BADGE[o.status] || STATUS_BADGE.DRAFT
                const salesperson = salespersons.find((s) => s.id === o.salesperson_id)
                const revenueType = revenueTypes.find((r) => r.id === o.revenue_type_id)
                return (
                  <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{o.order_code}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{o.order_date}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{salesperson?.full_name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{revenueType?.name || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{Number(o.revenue || 0).toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{cost > 0 ? cost.toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{profit !== 0 ? profit.toLocaleString('vi-VN') : '—'}</td>
                    <td className="px-4 py-3"><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      {busyId === o.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : o.status === 'DRAFT' ? (
                        <button onClick={() => confirmAndIssue(o)} className="text-green-600 font-medium hover:underline">Xác nhận & xuất kho</button>
                      ) : o.status === 'POSTED' ? (
                        <button onClick={() => cancelOrder(o)} className="text-red-500 hover:underline">Huỷ đơn (hoàn tác kho)</button>
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
