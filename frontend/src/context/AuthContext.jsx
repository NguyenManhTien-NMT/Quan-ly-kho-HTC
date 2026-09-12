import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Xác thực tự xây (mật khẩu bcrypt trong DB, qua RPC security definer
// authenticate_user) — cùng pattern với các app nội bộ khác của bạn,
// KHÔNG dùng Supabase Auth mặc định.

const AuthContext = createContext(null)
const STORAGE_KEY = 'kho_cost_app_session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else localStorage.removeItem(STORAGE_KEY)
  }, [user])

  async function login(username, password) {
    const { data, error } = await supabase.rpc('authenticate_user', {
      p_username: username,
      p_password: password,
    })
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Sai tên đăng nhập hoặc mật khẩu')
    }
    const row = data[0]
    const sessionUser = {
      id: row.user_id,
      fullName: row.full_name,
      role: row.role_code,
    }
    setUser(sessionUser)
    return sessionUser
  }

  function logout() {
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth phải dùng bên trong AuthProvider')
  return ctx
}
