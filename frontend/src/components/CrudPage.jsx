import { useEffect, useMemo, useState } from 'react'
import { Plus, X, RefreshCw, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import Avatar from './Avatar'
import Badge from './Badge'

/**
 * Màn hình CRUD danh mục dùng chung, phong cách đồng bộ với DebtFlow/Gungho
 * (bảng gọn, avatar chữ cái đầu, badge trạng thái, hành động dạng link chữ).
 * Không giả lập dữ liệu — mọi thao tác đọc/ghi đều gọi Supabase thật.
 *
 * columns: mảng mô tả field
 *   { key, label, type: 'text'|'number'|'select'|'checkbox',
 *     options?: [{value,label}]        // cho select tĩnh
 *     refTable?, refValue?, refLabel?  // cho select động (khoá ngoại)
 *     required?: boolean, isAvatar?: boolean } // isAvatar: cột này hiển thị kèm avatar chữ cái đầu
 */
export default function CrudPage({ title, table, columns, defaultOrder }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refOptions, setRefOptions] = useState({})
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)

  const refColumns = useMemo(() => columns.filter((c) => c.refTable), [columns])
  const avatarCol = useMemo(() => columns.find((c) => c.isAvatar) || columns[0], [columns])

  useEffect(() => {
    loadRows()
    loadRefOptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  async function loadRows() {
    setLoading(true)
    setError('')
    const hasCreatedAt = columns.some((c) => c.key === 'created_at')
    const orderCol = defaultOrder && columns.some((c) => c.key === defaultOrder)
      ? defaultOrder
      : hasCreatedAt
        ? 'created_at'
        : columns[0]?.key
    const ascending = orderCol !== 'created_at'
    const { data, error } = await supabase.from(table).select('*').order(orderCol, { ascending })
    if (error) setError(error.message)
    else setRows(data || [])
    setLoading(false)
  }

  async function loadRefOptions() {
    const next = {}
    for (const col of refColumns) {
      const { data, error } = await supabase.from(col.refTable).select(`${col.refValue},${col.refLabel}`)
      if (!error) next[col.key] = data || []
    }
    setRefOptions(next)
  }

  function openCreate() {
    const empty = {}
    columns.forEach((c) => {
      empty[c.key] = c.type === 'checkbox' ? true : ''
    })
    setEditing(empty)
  }

  function openEdit(row) {
    setEditing({ ...row })
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const payload = { ...editing }
    delete payload.id
    delete payload.created_at
    delete payload.updated_at

    let res
    if (editing.id) {
      res = await supabase.from(table).update(payload).eq('id', editing.id)
    } else {
      res = await supabase.from(table).insert(payload)
    }
    setSaving(false)
    if (res.error) {
      setError(res.error.message)
      return
    }
    setEditing(null)
    loadRows()
  }

  async function handleDeactivate(row) {
    const hasActive = 'active' in row
    const msg = hasActive
      ? `Ngừng hoạt động "${row[avatarCol.key]}"?`
      : `Xoá "${row[avatarCol.key]}"? Nếu bản ghi đã phát sinh giao dịch, hệ thống sẽ báo lỗi khoá ngoại thay vì xoá cứng.`
    if (!confirm(msg)) return

    if (hasActive) {
      const { error } = await supabase.from(table).update({ active: !row.active }).eq('id', row.id)
      if (error) setError(error.message)
      else loadRows()
      return
    }
    const { error } = await supabase.from(table).delete().eq('id', row.id)
    if (error) setError(error.message)
    else loadRows()
  }

  function refLabelFor(col, value) {
    const opts = refOptions[col.key] || []
    const found = opts.find((o) => o[col.refValue] === value)
    return found ? found[col.refLabel] : value
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{rows.length} bản ghi</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadRows}
            title="Tải lại"
            className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 text-white px-4 py-2 text-sm font-medium hover:bg-brand-700"
          >
            <Plus size={16} /> Thêm mới
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-gray-100 bg-white overflow-x-auto shadow-sm">
        {loading ? (
          <div className="p-10 flex items-center justify-center text-brand-600">
            <Loader2 className="animate-spin" size={20} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-400">
            Chưa có dữ liệu. Bấm "Thêm mới" để tạo bản ghi đầu tiên.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-3 font-medium text-gray-400 text-xs tracking-wide uppercase">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 w-32"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3 whitespace-nowrap">
                      {c.key === avatarCol.key ? (
                        <div className="flex items-center gap-2.5">
                          <Avatar name={String(row[c.key] ?? '')} size={28} />
                          <span className="font-medium text-ink">{row[c.key]}</span>
                        </div>
                      ) : c.type === 'checkbox' ? (
                        <Badge variant={row[c.key] ? 'green' : 'gray'}>{row[c.key] ? 'Hoạt động' : 'Ngừng'}</Badge>
                      ) : c.refTable ? (
                        refLabelFor(c, row[c.key])
                      ) : (
                        String(row[c.key] ?? '')
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right whitespace-nowrap text-sm">
                    <button onClick={() => openEdit(row)} className="text-brand-600 hover:underline">Sửa</button>
                    <span className="text-gray-300 mx-1.5">|</span>
                    <button onClick={() => handleDeactivate(row)} className="text-red-500 hover:underline">
                      {'active' in row ? (row.active ? 'Ngừng' : 'Mở lại') : 'Xoá'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleSave} className="bg-white rounded-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{editing.id ? 'Sửa bản ghi' : 'Thêm mới'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {columns.map((c) => (
                <div key={c.key}>
                  <label className="block text-xs text-gray-500 mb-1">{c.label}{c.required && ' *'}</label>
                  {c.type === 'checkbox' ? (
                    <label className="inline-flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={!!editing[c.key]}
                        onChange={(e) => setEditing({ ...editing, [c.key]: e.target.checked })}
                        className="h-4 w-4 rounded"
                      />
                      Đang hoạt động
                    </label>
                  ) : c.type === 'select' && c.options ? (
                    <select
                      value={editing[c.key] ?? ''}
                      required={c.required}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">-- Chọn --</option>
                      {c.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  ) : c.refTable ? (
                    <select
                      value={editing[c.key] ?? ''}
                      required={c.required}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value || null })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    >
                      <option value="">-- Chọn --</option>
                      {(refOptions[c.key] || []).map((o) => (
                        <option key={o[c.refValue]} value={o[c.refValue]}>{o[c.refLabel]}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={c.type === 'number' ? 'number' : 'text'}
                      step={c.type === 'number' ? 'any' : undefined}
                      required={c.required}
                      value={editing[c.key] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [c.key]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200">
                Huỷ
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white font-medium disabled:opacity-60">
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
