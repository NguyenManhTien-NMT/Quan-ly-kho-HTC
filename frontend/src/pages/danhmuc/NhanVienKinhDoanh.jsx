import CrudPage from '../../components/CrudPage'

export default function NhanVienKinhDoanh() {
  return (
    <CrudPage
      title="Nhân viên kinh doanh"
      table="salespersons"
      columns={[
        { key: 'emp_code', label: 'Mã NV', required: true },
        { key: 'full_name', label: 'Họ tên', required: true, isAvatar: true },
        { key: 'department', label: 'Bộ phận' },
        { key: 'position', label: 'Chức vụ' },
        { key: 'phone', label: 'SĐT' },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
