import CrudPage from '../../components/CrudPage'

export default function NguyenVatLieu() {
  return (
    <CrudPage
      title="Nguyên vật liệu"
      table="materials"
      columns={[
        { key: 'material_code', label: 'Mã NVL', required: true },
        { key: 'material_name', label: 'Tên NVL', required: true, isAvatar: true },
        { key: 'unit', label: 'ĐVT', required: true },
        { key: 'material_group_id', label: 'Nhóm NVL', refTable: 'material_groups', refValue: 'id', refLabel: 'name' },
        {
          key: 'material_type', label: 'Loại', type: 'select',
          options: [
            { value: 'nvl_thuc_pham', label: 'Nguyên liệu thực phẩm' },
            { value: 'do_uong', label: 'Đồ uống' },
            { value: 'bao_bi', label: 'Bao bì' },
            { value: 'ccdc', label: 'CCDC' },
            { value: 'hang_hoa', label: 'Hàng hoá' },
            { value: 'nvl_khac', label: 'Nguyên liệu khác' },
          ],
        },
        { key: 'warehouse_id', label: 'Kho mặc định', refTable: 'warehouses', refValue: 'id', refLabel: 'name' },
        { key: 'minimum_stock', label: 'Tồn tối thiểu', type: 'number' },
        { key: 'maximum_stock', label: 'Tồn tối đa', type: 'number' },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
