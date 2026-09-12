import CrudPage from '../../components/CrudPage'

export default function Kho() {
  return (
    <CrudPage
      title="Kho"
      table="warehouses"
      columns={[
        { key: 'code', label: 'Mã kho', required: true },
        { key: 'name', label: 'Tên kho', required: true, isAvatar: true },
        {
          key: 'warehouse_type', label: 'Loại kho', type: 'select', required: true,
          options: [
            { value: 'kho_uot', label: 'Kho ướt' },
            { value: 'kho_kho', label: 'Kho khô' },
            { value: 'kho_do_uong', label: 'Kho đồ uống' },
            { value: 'kho_thanh_pham', label: 'Kho thành phẩm' },
            { value: 'khac', label: 'Khác' },
          ],
        },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
