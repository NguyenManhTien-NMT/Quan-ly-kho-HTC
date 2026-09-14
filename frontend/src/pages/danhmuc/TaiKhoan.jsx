import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Loader2, KeyRound, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import Badge from '../../components/Badge'

const ROLE_BADGE = {
  admin: { label: 'Quản trị viên', variant: 'purple' },
  quan_ly: { label: 'Quản lý', variant: 'blue' },
  nhan_vien_kho: { label: 'Nhân viên kho', variant: 'green' },
  nhan_vien_kinh_doanh: { label: 'Nhân viên kinh doanh', variant: 'amber' },
  ke_toan: { label: 'Kế toán', variant: 'gray' },
  bep: { label: 'Bếp', variant: 'red' },
}

export default function TaiKhoan() {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [creating, setCreating] = useState(null) // { username, password, full_name, role_code, phone }
  const [resetting, setResetting] = useState(null) // { user, newPassword }
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError('')
    const [u, r] = await Promise.all([
      supabase.from('users').select('*, roles(code, name)').order('created_at', { ascending: false }),
      supabase.from('roles').select('id, code, name').order('name'),
    ])
    if (u.error) setError(u.error.message)
    else setUsers(u.data || [])
    setRoles(r.data || [])
    setLoading(false)
  }

  function openCreate() {
    setCreating({ username: '', password: '', full_name: '', role_code: roles[0]?.code || '', phone: '' })
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    if (!creating.username.trim() || !creating.password.trim() || !creating.full_name.trim() || !creating.role_code) {
      setError('Cần nhập đủ Tên đăng nhập, Mật khẩu, Họ tên và chọn Vai trò.')
      return
    }
    if (creating.password.trim().length < 6) {
      setError('Mật khẩu cần ít nhất 6 ký tự.')
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('create_user', {
      p_username: creating.username.trim(),
      p_password: creating.password.trim(),
      p_full_name: creating.full_name.trim(),
      p_role_code: creating.role_code,
      p_phone: creating.phone.trim() || null,
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setCreating(null)
    load()
  }

  async function toggleActive(u) {
    if (!confirm(`${u.active ? 'Khoá' : 'Mở khoá'} tài khoản "${u.username}"?`)) return
    setBusyId(u.id)
    setError('')
    const { error } = await supabase.from('users').update({ active: !u.active, updated_at: new Date().toISOString() }).eq('id', u.id)
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  async function changeRole(u, roleCode) {
    const role = roles.find((r) => r.code === roleCode)
    if (!role) return
    setBusyId(u.id)
    setError('')
    const { error } = await supabase.from('users').update({ role_id: role.id, updated_at: new Date().toISOString() }).eq('id', u.id)
    setBusyId(null)
    if (error) setError(error.message)
    else load()
  }

  function openReset(u) {
    setResetting({ user: u, newPassword: '' })
  }

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (resetting.newPassword.trim().length < 6) {
      setError('Mật khẩu mới cần ít nhất 6 ký tự.')
      return
    }
    setSaving(true)
    const { error } = await supabase.rpc('reset_user_password', {
      p_user_id: resetting.user.id,
      p_new_password: resetting.newPassword.trim(),
    })
    setSaving(false)
    if (error) { setError(error.message); return }
    setResetting(null)
    alert(`Đã đặt lại mật khẩu cho "${resetting.user.username}".`)
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">Nhân viên / Tài khoản</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} tài khoản</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700">
            <Plus size={16} /> Tạo tài khoản
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600"><Loader2 className="animate-spin" size={20} /></div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">Chưa có tài khoản nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Tên đăng nhập</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Họ tên</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">SĐT</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Vai trò</th>
                <th className="px-4 py-3 font-medium text-gray-400 text-xs uppercase">Trạng thái</th>
                <th className="px-4 py-3 w-64"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const roleInfo = ROLE_BADGE[u.roles?.code] || { label: u.roles?.name, variant: 'gray' }
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium text-ink whitespace-nowrap">{u.username}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{u.full_name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{u.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <select value={u.roles?.code || ''} onChange={(e) => changeRole(u, e.target.value)}
                        disabled={busyId === u.id}
                        className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
                        {roles.map((r) => <option key={r.id} value={r.code}>{ROLE_BADGE[r.code]?.label || r.name}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.active ? 'green' : 'red'}>{u.active ? 'Đang hoạt động' : 'Đã khoá'}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                      {busyId === u.id ? (
                        <Loader2 size={15} className="inline animate-spin text-gray-400" />
                      ) : (
                        <>
                          <button onClick={() => openReset(u)} className="inline-flex items-center gap-1 text-brand-600 hover:underline mr-3">
                            <KeyRound size={13} /> Đặt lại mật khẩu
                          </button>
                          <button onClick={() => toggleActive(u)} className={u.active ? 'text-red-500 hover:underline' : 'text-green-600 hover:underline'}>
                            {u.active ? 'Khoá' : 'Mở khoá'}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreate} className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Tạo tài khoản nhân viên mới</h2>
              <button type="button" onClick={() => setCreating(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Họ tên *</label>
              <input value={creating.full_name} onChange={(e) => setCreating({ ...creating, full_name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Tên đăng nhập *</label>
              <input value={creating.username} onChange={(e) => setCreating({ ...creating, username: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mật khẩu * (ít nhất 6 ký tự)</label>
              <input type="text" value={creating.password} onChange={(e) => setCreating({ ...creating, password: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Số điện thoại</label>
              <input value={creating.phone} onChange={(e) => setCreating({ ...creating, phone: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Vai trò *</label>
              <select value={creating.role_code} onChange={(e) => setCreating({ ...creating, role_code: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                {roles.map((r) => <option key={r.id} value={r.code}>{ROLE_BADGE[r.code]?.label || r.name}</option>)}
              </select>
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCreating(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
                {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
            </div>
          </form>
        </div>
      )}

      {resetting && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleReset} className="bg-white rounded-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">Đặt lại mật khẩu — {resetting.user.username}</h2>
              <button type="button" onClick={() => setResetting(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mật khẩu mới * (ít nhất 6 ký tự)</label>
              <input type="text" value={resetting.newPassword} onChange={(e) => setResetting({ ...resetting, newPassword: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setResetting(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">Huỷ</button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Đặt lại mật khẩu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
