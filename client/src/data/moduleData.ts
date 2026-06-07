import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Building2,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  FileSearch,
  FileText,
  Fuel,
  HandCoins,
  Handshake,
  IdCard,
  PackageCheck,
  PackagePlus,
  PackageSearch,
  Printer,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Truck,
  TruckIcon,
  UserCheck,
  Users,
  Warehouse,
  Receipt,
  Wallet,
} from 'lucide-react';
import type { ModuleCardProps } from '../components/ui/ModuleCard';

const WAREHOUSE_STAFF = 1;
const PACKER = 2;
const DRIVER = 4;
const DISPATCHER = 8;
const ACCOUNTANT = 16;
const MANAGER = 32;
const DIRECTOR = 64;

const WAREHOUSE_ROLES = WAREHOUSE_STAFF | PACKER;
const DELIVERY_ROLES = DRIVER | DISPATCHER;
const MANAGER_ROLES = MANAGER | DIRECTOR;

export type ModuleCardItem = Omit<ModuleCardProps, 'path'> & {
  path: string;
  requiredRoleMask?: number;
  isHidden?: boolean;
  isPrint?: boolean;
};

export type ModuleGroup = {
  id: string;
  path: string;
  section: string;
  requiredRoleMask?: number;
  items: ModuleCardItem[];
};

export const moduleGroups: ModuleGroup[] = [
  {
    id: 'warehouse',
    path: '/warehouse',
    section: 'Quản lý kho & bưu cục',
    requiredRoleMask: WAREHOUSE_ROLES,
    items: [
      { icon: Warehouse, title: 'Danh sách đơn', description: 'Xem toàn bộ vận đơn theo ngày và mã bill.', colorScheme: 'blue', path: '/warehouse/orders', requiredRoleMask: WAREHOUSE_ROLES },
      { icon: Warehouse, title: 'Đơn chưa chia hết', description: 'Theo dõi vận đơn tồn kho chưa phân đủ kiện lên xe.', colorScheme: 'slate', path: '/warehouse/inventory', requiredRoleMask: WAREHOUSE_ROLES, isHidden: true },
      { icon: Warehouse, title: 'Kho', description: 'Quản lý danh mục kho vận hành.', colorScheme: 'slate', path: '/warehouse/warehouses', requiredRoleMask: WAREHOUSE_ROLES },
      { icon: Building2, title: 'Danh sách Bưu cục', description: 'Tra cứu danh sách bưu cục HAN, HCM và thông tin vận hành.', colorScheme: 'blue', path: '/warehouse/hubs', requiredRoleMask: WAREHOUSE_ROLES },
      { icon: AlertTriangle, title: 'Thông báo hàng đến dự kiến', description: 'Theo dõi danh sách hàng sắp về bưu cục.', colorScheme: 'orange', path: '/warehouse/incoming', requiredRoleMask: WAREHOUSE_ROLES, isHidden: true },
      { icon: FileText, title: 'Chi tiết bảng kê', description: 'Xem danh sách vận đơn theo ngày tới và xe.', colorScheme: 'slate', path: '/warehouse/priority', requiredRoleMask: WAREHOUSE_ROLES },
    ],
  },
  {
    id: 'orders',
    path: '/orders',
    section: 'Quản lý Đơn hàng',
    requiredRoleMask: WAREHOUSE_ROLES | MANAGER_ROLES,
    items: [
      { icon: PackagePlus, title: 'Nhập đơn mới', description: 'Tạo vận đơn và ghi nhận thông tin gửi hàng.', colorScheme: 'green', path: '/orders/new', requiredRoleMask: WAREHOUSE_STAFF | MANAGER_ROLES },
      { icon: Users, title: 'Danh sách Khách hàng', description: 'Tra cứu mã KH và thông tin người gửi từ vận đơn.', colorScheme: 'emerald', path: '/orders/customers', requiredRoleMask: WAREHOUSE_ROLES | MANAGER_ROLES },
      { icon: Warehouse, title: 'Danh sách đơn', description: 'Xem toàn bộ vận đơn theo ngày và mã bill.', colorScheme: 'blue', path: '/warehouse/orders', requiredRoleMask: WAREHOUSE_ROLES | MANAGER_ROLES },
      { icon: FileSearch, title: 'Tìm kiếm vận đơn', description: 'Tra cứu vận đơn theo mã, trạng thái và bưu cục.', colorScheme: 'slate', path: '/search/waybills' },
    ],
  },
  {
    id: 'delivery',
    path: '/delivery',
    section: 'Quản lý giao hàng',
    requiredRoleMask: WAREHOUSE_ROLES | DELIVERY_ROLES,
    items: [
      { icon: AlertTriangle, title: 'Dự kiến xe đến', description: 'Xe đang chạy — sắp xếp theo giờ đến kho HCM.', colorScheme: 'orange', path: '/delivery/expected-arrivals', requiredRoleMask: WAREHOUSE_ROLES | DISPATCHER },
      { icon: Handshake, title: 'Bàn giao vận đơn cho tài xế', description: 'Bàn giao đơn cho tài xế chặng cuối.', colorScheme: 'green', path: '/delivery/handover', requiredRoleMask: DISPATCHER },
      { icon: TruckIcon, title: 'Giao hàng dọc đường (chành)', description: 'Ghi nhận giao hàng trong hành trình.', colorScheme: 'teal', path: '/delivery/en-route', requiredRoleMask: DRIVER },
      { icon: Building2, title: 'Giao hàng tại bưu cục đích', description: 'Xử lý đơn tại điểm nhận đích.', colorScheme: 'purple', path: '/delivery/hub-dropoff', requiredRoleMask: DISPATCHER },
      { icon: UserCheck, title: 'Giao hàng chặng cuối (shipper)', description: 'Theo dõi giao hàng đến người nhận.', colorScheme: 'orange', path: '/delivery/last-mile', requiredRoleMask: DRIVER },
      { icon: PackageCheck, title: 'Nhiệm vụ giao hàng', description: 'Danh sách đơn cần giao — nút Giao hàng cho tài xế.', colorScheme: 'green', path: '/nhiem-vu-giao-hang', requiredRoleMask: DRIVER | DISPATCHER },
      { icon: Route, title: 'Danh mục tuyến giao', description: 'Quản lý mã tuyến gán cho vận đơn tại kho đích.', colorScheme: 'cyan', path: '/admin/routes', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
      { icon: HandCoins, title: 'Quản lý COD & cước CC', description: 'Theo dõi thu hộ và cước người nhận trả.', colorScheme: 'amber', path: '/delivery/cod', requiredRoleMask: DRIVER | ACCOUNTANT },
    ],
  },
  {
    id: 'trips',
    path: '/trips',
    section: 'Quản lý xe vận tải',
    requiredRoleMask: DISPATCHER,
    items: [
      { icon: Truck, title: 'Danh sách chuyến xe', description: 'Theo dõi các chuyến xe đường trục.', colorScheme: 'blue', path: '/trips/list', requiredRoleMask: DISPATCHER },
      { icon: Fuel, title: 'Chi phí phát sinh chuyến', description: 'Ghi nhận dầu và chi phí dọc đường.', colorScheme: 'orange', path: '/trips/expenses', requiredRoleMask: DISPATCHER },
      { icon: BadgeDollarSign, title: 'Lãi/lỗ tạm tính chuyến', description: 'Theo dõi hiệu quả chi phí chuyến xe.', colorScheme: 'purple', path: '/trips/profit', requiredRoleMask: MANAGER, isHidden: true },
      { icon: TruckIcon, title: 'Quản lý xe đường trục', description: 'Quản lý phương tiện chạy tuyến đường trục và trạng thái khai thác.', colorScheme: 'cyan', path: '/trips/trunk-vehicles', requiredRoleMask: DISPATCHER },
      { icon: TruckIcon, title: 'Quản lý xe nội bộ', description: 'Quản lý đội xe và định mức nhiên liệu.', colorScheme: 'cyan', path: '/trucks', requiredRoleMask: DISPATCHER },
      { icon: ShieldCheck, title: 'Chấm điểm tài xế', description: 'Đánh giá hiệu suất tài xế vận tải.', colorScheme: 'amber', path: '/drivers/performance', requiredRoleMask: DISPATCHER },
    ],
  },
  {
    id: 'search',
    path: '/search',
    section: 'Tìm kiếm chuyên sâu',
    items: [
      { icon: Search, title: 'Tìm kiếm tổng hợp', description: 'Tra cứu vận đơn, chuyến xe và dữ liệu liên quan.', colorScheme: 'blue', path: '/search/general' },
      { icon: PackageSearch, title: 'Kết quả tìm kiếm — vận đơn', description: 'Xem kết quả tìm kiếm theo vận đơn.', colorScheme: 'green', path: '/search/waybills' },
      { icon: FileSearch, title: 'Kết quả tìm kiếm — chuyến xe', description: 'Xem kết quả tìm kiếm theo chuyến xe.', colorScheme: 'teal', path: '/search/trips' },
    ],
  },
  {
    id: 'fleet',
    path: '/fleet',
    section: 'Danh mục xe',
    requiredRoleMask: DISPATCHER | MANAGER_ROLES,
    items: [
      { icon: TruckIcon, title: 'Danh sách xe', description: 'Quản lý lái xe, khu vực, nhà xe, BKS và loại xe.', colorScheme: 'cyan', path: '/fleet/vehicles', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
      { icon: Fuel, title: 'Chi phí xe', description: 'Theo dõi ngày, BKS, loại chi phí, số tiền và trạng thái.', colorScheme: 'amber', path: '/fleet/vehicle-costs', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
    ],
  },
  {
    id: 'transport-extended',
    path: '/transport',
    section: 'Vận tải mở rộng',
    requiredRoleMask: DISPATCHER | MANAGER_ROLES,
    items: [
      { icon: Route, title: 'Vận tải Bắc Nam', description: 'Quản lý bill, doanh thu, chi phí và lợi nhuận cuối.', colorScheme: 'blue', path: '/transport/north-south', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
      { icon: PackageSearch, title: 'Chành', description: 'Quản lý chành theo tỉnh, công ty, mặt hàng, nhà xe và bill.', colorScheme: 'teal', path: '/transport/chanh', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
    ],
  },
  {
    id: 'customer-directory',
    path: '/customers',
    section: 'Khách hàng',
    requiredRoleMask: WAREHOUSE_ROLES | ACCOUNTANT | MANAGER_ROLES,
    items: [
      { icon: Users, title: 'Khách hàng', description: 'Quản lý họ tên, SĐT, địa chỉ và mã khách hàng.', colorScheme: 'emerald', path: '/customers/directory', requiredRoleMask: WAREHOUSE_ROLES | ACCOUNTANT | MANAGER_ROLES },
    ],
  },
  {
    id: 'hr',
    path: '/hr',
    section: 'Nhân sự',
    requiredRoleMask: MANAGER_ROLES,
    items: [
      {
        icon: Users,
        title: 'Danh sách nhân sự',
        description: 'Xem danh sách nhân viên từ hệ thống users.',
        colorScheme: 'blue',
        path: '/hr/staff',
        requiredRoleMask: MANAGER_ROLES,
      },
      {
        icon: Clock,
        title: 'Chấm công',
        description: 'Ghi nhận giờ vào, giờ ra theo ngày làm việc.',
        colorScheme: 'teal',
        path: '/hr/attendance',
        requiredRoleMask: MANAGER_ROLES,
      },
    ],
  },
  {
    id: 'finance',
    path: '/finance',
    section: 'Tài chính kế toán',
    requiredRoleMask: ACCOUNTANT,
    items: [
      { icon: Banknote, title: 'Đối soát COD với khách hàng', description: 'Đối chiếu COD theo khách hàng.', colorScheme: 'green', path: '/finance/cod-reconciliation', requiredRoleMask: ACCOUNTANT },
      { icon: ClipboardCheck, title: 'Phê duyệt chi phí xe nội bộ', description: 'Duyệt chi phí phát sinh cho xe công ty.', colorScheme: 'blue', path: '/finance/approve/internal', requiredRoleMask: ACCOUNTANT },
      { icon: CreditCard, title: 'Phê duyệt chi phí NCC đường trục', description: 'Duyệt chi phí nhà cung cấp vận tải.', colorScheme: 'purple', path: '/finance/approve/vendor', requiredRoleMask: ACCOUNTANT },
      { icon: Building2, title: 'Công nợ & Thanh toán NCC', description: 'Bảng kê chuyến, phiếu chi và sổ cái dư nợ nhà xe.', colorScheme: 'pink', path: '/finance/vendor-debt', requiredRoleMask: ACCOUNTANT },
      { icon: Calculator, title: 'Đối soát tiền mặt bưu cục', description: 'Theo dõi COD, CC và nộp tiền bưu cục.', colorScheme: 'amber', path: '/finance/hub-reconciliation', requiredRoleMask: ACCOUNTANT },
      { icon: Receipt, title: 'Phiếu thu chi', description: 'Lập và tra cứu phiếu thu, phiếu chi theo chi phí xe.', colorScheme: 'teal', path: '/finance/cash-vouchers', requiredRoleMask: ACCOUNTANT | MANAGER_ROLES },
      { icon: Wallet, title: 'Số quỹ', description: 'Theo dõi số dư quỹ tiền mặt theo mã quỹ và bưu cục.', colorScheme: 'emerald', path: '/finance/fund-balances', requiredRoleMask: ACCOUNTANT | MANAGER_ROLES },
      { icon: ClipboardList, title: 'Nhật ký thu chi', description: 'Ghi nhận thu nhập và chi phí theo nguồn/phân loại.', colorScheme: 'slate', path: '/finance/cash-journal', requiredRoleMask: ACCOUNTANT | MANAGER_ROLES },
      { icon: BarChart3, title: 'Dashboard thu chi', description: 'Tổng quan dòng tiền thu bill, chi bill và chi NCC.', colorScheme: 'blue', path: '/finance/cashflow-dashboard', requiredRoleMask: ACCOUNTANT | MANAGER_ROLES },
    ],
  },
  {
    id: 'dashboard',
    path: '/dashboard',
    section: 'Dashboard ban giám đốc',
    requiredRoleMask: MANAGER_ROLES,
    items: [
      { icon: BarChart3, title: 'Dashboard KPI toàn công ty', description: 'Theo dõi KPI vận hành và doanh thu.', colorScheme: 'blue', path: '/dashboard/kpi', requiredRoleMask: MANAGER, isHidden: true },
      { icon: AlertTriangle, title: 'Giám sát giao hàng quá hạn', description: 'Cảnh báo đơn quá SLA giao hàng.', colorScheme: 'orange', path: '/dashboard/overdue', requiredRoleMask: MANAGER_ROLES },
      { icon: BadgeDollarSign, title: 'Báo cáo doanh thu theo khách hàng', description: 'Phân tích doanh thu theo khách hàng.', colorScheme: 'green', path: '/reports/revenue', requiredRoleMask: MANAGER_ROLES },
      { icon: Users, title: 'Quản trị nhân sự & phân quyền', description: 'Quản lý người dùng và role bitmask.', colorScheme: 'purple', path: '/admin/users', requiredRoleMask: DIRECTOR },
    ],
  },
  {
    id: 'shared',
    path: '/admin',
    section: 'Dùng chung',
    items: [
      { icon: Building2, title: 'Quản lý bưu cục', description: 'Quản lý bưu cục HAN, HCM và thông tin liên quan.', colorScheme: 'blue', path: '/admin/hubs', requiredRoleMask: DIRECTOR },
      { icon: TruckIcon, title: 'Quản lý xe & tài xế', description: 'Quản lý phương tiện, tài xế và phân công.', colorScheme: 'teal', path: '/admin/trucks', requiredRoleMask: DIRECTOR },
      { icon: Route, title: 'Danh mục tuyến giao', description: 'Mã tuyến dùng khi gán vận đơn và in tồn kho.', colorScheme: 'cyan', path: '/admin/routes', requiredRoleMask: DISPATCHER | MANAGER_ROLES },
      { icon: Settings, title: 'Cấu hình NCC đường trục', description: 'Thiết lập nhà cung cấp vận tải đường trục.', colorScheme: 'purple', path: '/admin/vendors', requiredRoleMask: MANAGER_ROLES },
      { icon: TruckIcon, title: 'Nhà xe', description: 'Gán BKS theo khu vực; nhà xe chọn từ NCC đường trục.', colorScheme: 'cyan', path: '/admin/carriers', requiredRoleMask: MANAGER_ROLES },
      { icon: Printer, title: 'In phiếu giao nhận', description: 'Template in phiếu giao nhận riêng.', colorScheme: 'orange', path: '/print/waybill/:id', isPrint: true },
      { icon: IdCard, title: 'Hồ sơ & cài đặt cá nhân', description: 'Quản lý hồ sơ và tuỳ chọn cá nhân.', colorScheme: 'green', path: '/profile' },
    ],
  },
];

export const getVisibleItems = (group: ModuleGroup, roleMask: number): ModuleCardItem[] => {
  const isManagerPlus = (roleMask & MANAGER_ROLES) !== 0;

  return group.items.filter((item) => {
    if (item.isHidden && !isManagerPlus) {
      return false;
    }

    // MANAGER/DIRECTOR: xem toàn bộ module (trừ mục ẩn đã lọc ở trên)
    if (isManagerPlus) {
      return true;
    }

    return !item.requiredRoleMask || (roleMask & item.requiredRoleMask) !== 0;
  });
};

export const moduleData: Record<string, ModuleGroup[]> = moduleGroups.reduce<Record<string, ModuleGroup[]>>(
  (data, group) => ({
    ...data,
    [group.path]: [group],
  }),
  {},
);

export const moduleRoutes = moduleGroups.map((group) => group.path);

export const getModulePathForRoute = (routePath: string): string | undefined => {
  const matchedGroup = moduleGroups.find((group) =>
    group.path === routePath || group.items.some((item) => item.path === routePath),
  );

  return matchedGroup?.path;
};
