import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Sidebar from './components/Sidebar'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NguyenVatLieu from './pages/danhmuc/NguyenVatLieu'
import NhomNguyenLieu from './pages/danhmuc/NhomNguyenLieu'
import NhaCungCap from './pages/danhmuc/NhaCungCap'
import MonAn from './pages/danhmuc/MonAn'
import NhomMon from './pages/danhmuc/NhomMon'
import KhachHang from './pages/danhmuc/KhachHang'
import NhanVienKinhDoanh from './pages/danhmuc/NhanVienKinhDoanh'
import Kho from './pages/danhmuc/Kho'
import LoaiDoanhThu from './pages/danhmuc/LoaiDoanhThu'
import NhapKho from './pages/kho/NhapKho'
import XuatKho from './pages/kho/XuatKho'
import KiemKe from './pages/kho/KiemKe'
import SoKho from './pages/kho/SoKho'
import CostMon from './pages/cost/CostMon'
import CostMam from './pages/cost/CostMam'
import DonHang from './pages/donhang/DonHang'
import BaoCao from './pages/baocao/BaoCao'

function ProtectedLayout({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen">{children}</main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<ProtectedLayout><Dashboard /></ProtectedLayout>} />
        <Route path="/danh-muc/nguyen-vat-lieu" element={<ProtectedLayout><NguyenVatLieu /></ProtectedLayout>} />
        <Route path="/danh-muc/nhom-nguyen-lieu" element={<ProtectedLayout><NhomNguyenLieu /></ProtectedLayout>} />
        <Route path="/danh-muc/nha-cung-cap" element={<ProtectedLayout><NhaCungCap /></ProtectedLayout>} />
        <Route path="/danh-muc/mon-an" element={<ProtectedLayout><MonAn /></ProtectedLayout>} />
        <Route path="/danh-muc/nhom-mon" element={<ProtectedLayout><NhomMon /></ProtectedLayout>} />
        <Route path="/danh-muc/khach-hang" element={<ProtectedLayout><KhachHang /></ProtectedLayout>} />
        <Route path="/danh-muc/nhan-vien-kinh-doanh" element={<ProtectedLayout><NhanVienKinhDoanh /></ProtectedLayout>} />
        <Route path="/danh-muc/kho" element={<ProtectedLayout><Kho /></ProtectedLayout>} />
        <Route path="/danh-muc/loai-doanh-thu" element={<ProtectedLayout><LoaiDoanhThu /></ProtectedLayout>} />
        <Route path="/kho/nhap-kho" element={<ProtectedLayout><NhapKho /></ProtectedLayout>} />
        <Route path="/kho/xuat-kho" element={<ProtectedLayout><XuatKho /></ProtectedLayout>} />
        <Route path="/kho/kiem-ke" element={<ProtectedLayout><KiemKe /></ProtectedLayout>} />
        <Route path="/kho/so-kho" element={<ProtectedLayout><SoKho /></ProtectedLayout>} />
        <Route path="/cost/mon" element={<ProtectedLayout><CostMon /></ProtectedLayout>} />
        <Route path="/cost/mam" element={<ProtectedLayout><CostMam /></ProtectedLayout>} />
        <Route path="/don-hang" element={<ProtectedLayout><DonHang /></ProtectedLayout>} />
        <Route path="/bao-cao" element={<ProtectedLayout><BaoCao /></ProtectedLayout>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
