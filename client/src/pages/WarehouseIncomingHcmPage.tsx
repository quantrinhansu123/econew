import WarehouseIncomingPage from './WarehouseIncomingPage';

export default function WarehouseIncomingHcmPage() {
  return (
    <WarehouseIncomingPage
      mode="expected-arrivals"
      title="Xe đang đến"
      subtitle="Chỉ hiển thị xe đã khởi hành và đang trên đường đến bưu cục của tài khoản hiện tại; xe đã đến sẽ tự ẩn."
      emptyText="Hiện chưa có xe đang trên đường đến bưu cục."
    />
  );
}
