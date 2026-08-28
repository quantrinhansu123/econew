import { BarChart3, Building2, Calculator, PackagePlus, ScanBarcode, Search, Settings, Truck, Users, Warehouse } from 'lucide-react';

const MANAGER_ROLES = 32 | 64;
const WAREHOUSE_ORDER_ROLES = 1 | 2 | 32 | 64;
const DELIVERY_ROLES = 1 | 2 | 4 | 8 | 32 | 64;

export const dashboardModules = [
  { icon: Warehouse, title: 'Quản lý kho & bưu cục', description: 'Tồn kho, nhập đơn, tiếp nhận, manifest và đóng xếp hàng.', href: '/warehouse', colorScheme: 'blue' as const },
  { icon: PackagePlus, title: 'Quản lý Đơn hàng', description: 'Tạo đơn, tồn kho, tiếp nhận, ưu tiên giao và khách hàng.', href: '/orders', colorScheme: 'green' as const, requiredRoleMask: WAREHOUSE_ORDER_ROLES },
  { icon: ScanBarcode, title: 'Quản lý giao hàng', description: 'Báo phát bằng ảnh, nhận diện mã vận đơn và lưu bằng chứng giao hàng.', href: '/delivery', colorScheme: 'green' as const, requiredRoleMask: DELIVERY_ROLES },
  { icon: Truck, title: 'Quản lý xe vận tải', description: 'Chi phí chuyến, xe đường trục và đội xe nội bộ.', href: '/trips', colorScheme: 'teal' as const },
  { icon: Search, title: 'Tìm kiếm chuyên sâu', description: 'Tra cứu tổng hợp vận đơn, chuyến xe và dữ liệu liên quan.', href: '/search', colorScheme: 'purple' as const },
  { icon: Calculator, title: 'Tài chính kế toán', description: 'Đối soát COD, duyệt chi phí và tiền mặt bưu cục.', href: '/finance', colorScheme: 'amber' as const },
  { icon: Users, title: 'Nhân sự', description: 'Danh sách nhân viên và chấm công theo ngày.', href: '/hr', colorScheme: 'purple' as const },
  { icon: BarChart3, title: 'Dashboard BGĐ', description: 'KPI toàn công ty, quá hạn SLA và báo cáo doanh thu.', href: '/dashboard', colorScheme: 'orange' as const },
  { icon: Building2, title: 'Dùng chung', description: 'Bưu cục, xe & tài xế, NCC, in phiếu và hồ sơ cá nhân.', href: '/admin', colorScheme: 'blue' as const, requiredRoleMask: MANAGER_ROLES },
  { icon: Settings, title: 'Nhà cung cấp (NCC)', description: 'Danh sách nhà cung cấp vận tải đường trục, tuyến và bảng giá.', href: '/admin/vendors', colorScheme: 'purple' as const, requiredRoleMask: MANAGER_ROLES },
];
