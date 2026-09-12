import CrudPage from '../../components/CrudPage'

export default function NhomMon() {
  return (
    <CrudPage
      title="Nhóm món / thành phẩm"
      table="product_groups"
      columns={[
        { key: 'code', label: 'Mã nhóm', required: true },
        { key: 'name', label: 'Tên nhóm', required: true, isAvatar: true },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
