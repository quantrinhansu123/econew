import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, Calculator, PackagePlus, ScanBarcode, Search, Settings, Truck, Users, Warehouse } from 'lucide-react';
import { clsx } from 'clsx';
import { ActionCard } from '../components/ui/ActionCard';
import { getGreetingPeriod, getLoginDisplayName, getStoredAuthUser } from '../lib/authUser';
import type { AuthUserProfile } from './login/types';

const MANAGER_ROLES = 32 | 64;

const WAREHOUSE_ORDER_ROLES = 1 | 2 | 32 | 64;
const DELIVERY_ROLES = 1 | 2 | 4 | 8 | 32 | 64;

export const dashboardModules = [
  {
    icon: Warehouse,
    title: 'Quản lý kho & bưu cục',
    description: 'Tồn kho, nhập đơn, tiếp nhận, manifest và đóng xếp hàng.',
    href: '/warehouse',
    colorScheme: 'blue' as const,
  },
  {
    icon: PackagePlus,
    title: 'Quản lý Đơn hàng',
    description: 'Tạo đơn, tồn kho, tiếp nhận, ưu tiên giao và khách hàng.',
    href: '/orders',
    colorScheme: 'green' as const,
    requiredRoleMask: WAREHOUSE_ORDER_ROLES,
  },
  {
    icon: ScanBarcode,
    title: 'Quản lý giao hàng',
    description: 'Báo phát bằng ảnh, nhận diện mã vận đơn và lưu bằng chứng giao hàng.',
    href: '/delivery',
    colorScheme: 'green' as const,
    requiredRoleMask: DELIVERY_ROLES,
  },
  {
    icon: Truck,
    title: 'Quản lý xe vận tải',
    description: 'Chi phí chuyến, xe đường trục và đội xe nội bộ.',
    href: '/trips',
    colorScheme: 'teal' as const,
  },
  {
    icon: Search,
    title: 'Tìm kiếm chuyên sâu',
    description: 'Tra cứu tổng hợp vận đơn, chuyến xe và dữ liệu liên quan.',
    href: '/search',
    colorScheme: 'purple' as const,
  },
  {
    icon: Calculator,
    title: 'Tài chính kế toán',
    description: 'Đối soát COD, duyệt chi phí và tiền mặt bưu cục.',
    href: '/finance',
    colorScheme: 'amber' as const,
  },
  {
    icon: Users,
    title: 'Nhân sự',
    description: 'Danh sách nhân viên và chấm công theo ngày.',
    href: '/hr',
    colorScheme: 'purple' as const,
  },
  {
    icon: BarChart3,
    title: 'Dashboard BGĐ',
    description: 'KPI toàn công ty, quá hạn SLA và báo cáo doanh thu.',
    href: '/dashboard',
    colorScheme: 'orange' as const,
  },
  {
    icon: Building2,
    title: 'Dùng chung',
    description: 'Bưu cục, xe & tài xế, NCC, in phiếu và hồ sơ cá nhân.',
    href: '/admin',
    colorScheme: 'blue' as const,
    requiredRoleMask: MANAGER_ROLES,
  },
  {
    icon: Settings,
    title: 'Cấu hình NCC',
    description: 'Danh sách nhà cung cấp vận tải đường trục, tuyến và bảng giá.',
    href: '/admin/vendors',
    colorScheme: 'purple' as const,
    requiredRoleMask: MANAGER_ROLES,
  },
];

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chuc-nang' | 'danh-dau' | 'tat-ca'>('chuc-nang');
  const [user, setUser] = useState<AuthUserProfile | null>(() => getStoredAuthUser());
  const loginName = getLoginDisplayName(user);
  const greetingPeriod = getGreetingPeriod();
  const roleMask = user?.role_mask ?? 0;
  const visibleModules = useMemo(
    () =>
      dashboardModules.filter(
        module => !module.requiredRoleMask || (roleMask & module.requiredRoleMask) !== 0,
      ),
    [roleMask],
  );

  useEffect(() => {
    const syncUser = () => setUser(getStoredAuthUser());
    syncUser();
    window.addEventListener('storage', syncUser);
    window.addEventListener('focus', syncUser);
    return () => {
      window.removeEventListener('storage', syncUser);
      window.removeEventListener('focus', syncUser);
    };
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Chào {greetingPeriod},{' '}
          <span className="text-primary">{loginName}</span> 👋
        </h1>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border p-1 flex items-center gap-1 mb-6 w-fit">
        {[
          { key: 'chuc-nang', label: 'Chức năng' },
          { key: 'danh-dau', label: 'Đánh dấu' },
          { key: 'tat-ca', label: 'Tất cả' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={clsx(
              'px-4 py-2 rounded-lg text-[13px] font-bold transition-all duration-200',
              activeTab === tab.key
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'danh-dau' ? (
        <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border">
          Chưa có module nào được đánh dấu.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {visibleModules.map((module) => (
            <ActionCard key={module.href} {...module} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
