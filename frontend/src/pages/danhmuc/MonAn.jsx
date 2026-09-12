import CrudPage from '../../components/CrudPage'

export default function MonAn() {
  return (
    <CrudPage
      title="Món ăn / thành phẩm"
      table="products"
      columns={[
        { key: 'product_code', label: 'Mã món', required: true },
        { key: 'product_name', label: 'Tên món', required: true, isAvatar: true },
        { key: 'unit', label: 'ĐVT', required: true },
        { key: 'product_group_id', label: 'Nhóm món', refTable: 'product_groups', refValue: 'id', refLabel: 'name' },
        { key: 'selling_price', label: 'Giá bán', type: 'number', required: true },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
