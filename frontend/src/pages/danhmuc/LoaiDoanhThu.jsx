import CrudPage from '../../components/CrudPage'

export default function LoaiDoanhThu() {
  return (
    <CrudPage
      title="Loại doanh thu"
      table="revenue_types"
      columns={[
        { key: 'code', label: 'Mã loại', required: true },
        { key: 'name', label: 'Tên loại (VD: Hội trường, Phòng VIP, Bar...)', required: true, isAvatar: true },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
