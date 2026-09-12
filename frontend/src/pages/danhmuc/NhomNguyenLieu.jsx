import CrudPage from '../../components/CrudPage'

export default function NhomNguyenLieu() {
  return (
    <CrudPage
      title="Nhóm nguyên liệu"
      table="material_groups"
      columns={[
        { key: 'code', label: 'Mã nhóm', required: true },
        { key: 'name', label: 'Tên nhóm', required: true, isAvatar: true },
        { key: 'parent_group_id', label: 'Nhóm lớn (nếu có)', refTable: 'material_groups', refValue: 'id', refLabel: 'name' },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
