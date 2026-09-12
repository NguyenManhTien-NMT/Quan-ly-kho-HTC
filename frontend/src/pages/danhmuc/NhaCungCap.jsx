import CrudPage from '../../components/CrudPage'

export default function NhaCungCap() {
  return (
    <CrudPage
      title="Nhà cung cấp"
      table="suppliers"
      columns={[
        { key: 'supplier_code', label: 'Mã NCC', required: true },
        { key: 'supplier_name', label: 'Tên NCC', required: true, isAvatar: true },
        { key: 'phone', label: 'Điện thoại' },
        { key: 'address', label: 'Địa chỉ' },
        { key: 'tax_code', label: 'MST' },
        {
          key: 'payment_type', label: 'Hình thức nhập', type: 'select',
          options: [
            { value: 'tien_mat', label: 'Tiền mặt' },
            { value: 'cong_no', label: 'Công nợ' },
            { value: 'noi_bo', label: 'Nội bộ' },
            { value: 'nhap_bat_thuong', label: 'Nhập bất thường' },
            { value: 'kho_che_bien', label: 'Kho chế biến' },
            { value: 'nhap_tu_don_vi_khac', label: 'Nhập từ đơn vị khác' },
          ],
        },
        { key: 'active', label: 'Đang hoạt động', type: 'checkbox' },
      ]}
    />
  )
}
