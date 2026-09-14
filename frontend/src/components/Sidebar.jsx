import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Logo from './Logo'
import Avatar from './Avatar'
import Badge from './Badge'
import {
  LayoutDashboard, Package, ChefHat, ShoppingCart, Warehouse,
  BarChart3, Settings, LogOut, ChevronRight, KeyRound,
} from 'lucide-react'

const ROLE_LABEL = {
  admin: 'Quản trị',
  quan_ly: 'Quản lý',
  nhan_vien_kho: 'Nhân viên kho',
  nhan_vien_kinh_doanh: 'NVKD',
  ke_toan: 'Kế toán',
  bep: 'Bếp',
}

const menu = [
  { label: 'Dashboard', icon: LayoutDashboard, to: '/' },
  {
    label: 'Danh mục', icon: Package,
    children: [
      { label: 'Nguyên vật liệu', to: '/danh-muc/nguyen-vat-lieu' },
      { label: 'Nhóm NVL', to: '/danh-muc/nhom-nguyen-lieu' },
      { label: 'Nhà cung cấp', to: '/danh-muc/nha-cung-cap' },
      { label: 'Món ăn / thành phẩm', to: '/danh-muc/mon-an' },
      { label: 'Nhóm món', to: '/danh-muc/nhom-mon' },
      { label: 'Khách hàng', to: '/danh-muc/khach-hang' },
      { label: 'Nhân viên kinh doanh', to: '/danh-muc/nhan-vien-kinh-doanh' },
      { label: 'Kho', to: '/danh-muc/kho' },
      { label: 'Loại doanh thu', to: '/danh-muc/loai-doanh-thu' },
    ],
  },
  {
    label: 'Cost món / mâm', icon: ChefHat,
    children: [
      { label: 'Cost món', to: '/cost/mon' },
      { label: 'Cost mâm / combo', to: '/cost/mam' },
    ],
  },
  {
    label: 'Đơn hàng / Doanh thu', icon: ShoppingCart,
    children: [
      { label: 'Đơn hàng', to: '/don-hang' },
    ],
  },
  {
    label: 'Kho (Nhập-Xuất-Tồn)', icon: Warehouse,
    children: [
      { label: 'Nhập kho', to: '/kho/nhap-kho' },
      { label: 'Xuất kho', to: '/kho/xuat-kho' },
      { label: 'Kiểm kê / Điều chỉnh', to: '/kho/kiem-ke' },
      { label: 'Sổ kho', to: '/kho/so-kho' },
    ],
  },
  { label: 'Báo cáo', icon: BarChart3, to: '/bao-cao' },
]

function MenuGroup({ item }) {
  const location = useLocation()
  const childActive = item.children?.some((c) => location.pathname === c.to)
  const [open, setOpen] = useState(childActive)

  if (item.disabled) {
    return (
      <div className="flex items-center justify-between px-4 py-2.5 text-sm text-navy-400 cursor-not-allowed">
        <span className="flex items-center gap-3"><item.icon size={17} /> {item.label}</span>
        <ChevronRight size={15} />
      </div>
    )
  }

  if (!item.children) {
    return (
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          `flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg mx-2 ${
            isActive ? 'bg-brand-600 text-white' : 'text-navy-50/80 hover:bg-white/5'
          }`
        }
      >
        <item.icon size={17} /> {item.label}
      </NavLink>
    )
  }

  return (
    <div className="mx-2">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-4 py-2.5 text-sm rounded-lg ${
          childActive ? 'text-white' : 'text-navy-50/80 hover:bg-white/5'
        }`}
      >
        <span className="flex items-center gap-3"><item.icon size={17} /> {item.label}</span>
        <ChevronRight size={15} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {item.children.map((c) => (
            <NavLink
              key={c.to}
              to={c.to}
              className={({ isActive }) =>
                `flex items-center gap-2 pl-11 pr-4 py-2 text-sm rounded-lg ${
                  isActive ? 'bg-brand-600 text-white' : 'text-navy-50/70 hover:bg-white/5'
                }`
              }
            >
              {c.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Sidebar() {
  const { user, logout } = useAuth()

  return (
    <aside className="w-64 shrink-0 bg-navy-900 flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-3 px-5 py-5">
        <Logo size={36} />
        <div>
          <div className="text-white font-semibold text-sm leading-tight">HTC - QL - KHO</div>
          <div className="text-navy-400 text-xs">Kho · Cost · Giá vốn</div>
        </div>
      </div>

      <div className="mx-4 mb-3 p-3 rounded-xl bg-white/5 flex items-center gap-3">
        <Avatar name={user?.fullName} size={34} />
        <div className="min-w-0">
          <div className="text-white text-sm font-medium truncate">{user?.fullName}</div>
          <Badge variant="purple">{ROLE_LABEL[user?.role] || user?.role}</Badge>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 pb-4">
        {menu.map((item) => (
          <MenuGroup key={item.label} item={item} />
        ))}
      </nav>

      <div className="border-t border-white/10 px-2 py-3 space-y-0.5">
        <button className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-navy-50/70 hover:bg-white/5 rounded-lg">
          <KeyRound size={16} /> Đổi mật khẩu
        </button>
        <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-navy-50/70 hover:bg-white/5 rounded-lg">
          <LogOut size={16} /> Đăng xuất
        </button>
      </div>
    </aside>
  )
}
