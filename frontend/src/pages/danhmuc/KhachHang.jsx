import CrudPage from '../../components/CrudPage'

export default function KhachHang() {
  return (
    <CrudPage
      title="Khách hàng"
      table="customers"
      columns={[
        { key: 'customer_code', label: 'Mã khách hàng', required: true },
        { key: 'customer_name', label: 'Tên khách hàng', required: true, isAvatar: true },
        { key: 'phone', label: 'Điện thoại' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'tax_code', label: 'MST' },
        { key: 'customer_type', label: 'Loại khách hàng' },
        { key: 'customer_group', label: 'Nhóm khách hàng' },
        { key: 'salesperson_id', label: 'NVKD phụ trách', refTable: 'salespersons', refValue: 'id', refLabel: 'full_name' },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
