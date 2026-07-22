import {
  BarChart3,
  Building2,
  Calculator,
  Home,
  PackagePlus,
  PackageSearch,
  Search,
  Settings,
  Truck,
  TruckIcon,
  Users,
  Warehouse,
} from 'lucide-react';
import React from 'react';

export type SidebarItem = {
  id: string;
  icon: React.ElementType;
  label: string;
  path: string;
  requiredRoleMask?: number;
  children?: SidebarItem[];
};

export const sidebarMenu: SidebarItem[] = [
  { id: 'home', icon: Home, label: 'Trang chủ', path: '/' },
  { id: 'orders', icon: PackagePlus, label: 'Quản lý Đơn hàng', path: '/orders', requiredRoleMask: 1 | 2 | 16 | 32 | 64 },
  { id: 'warehouse', icon: Warehouse, label: 'Quản lý kho', path: '/warehouse', requiredRoleMask: 1 | 2 | 32 | 64 },
  { id: 'delivery-tasks', icon: PackageSearch, label: 'Nhiệm vụ giao hàng', path: '/nhiem-vu-giao-hang', requiredRoleMask: 4 | 8 | 32 | 64 },
  { id: 'trips', icon: Truck, label: 'Quản lý xe', path: '/trips', requiredRoleMask: 8 },
  { id: 'fleet', icon: TruckIcon, label: 'Danh mục xe', path: '/fleet', requiredRoleMask: 8 | 32 | 64 },
  { id: 'transport', icon: PackageSearch, label: 'Vận tải mở rộng', path: '/transport', requiredRoleMask: 8 | 32 | 64 },
  { id: 'customers', icon: Users, label: 'Khách hàng', path: '/customers', requiredRoleMask: 1 | 2 | 16 | 32 | 64 },
  { id: 'search', icon: Search, label: 'Tìm kiếm', path: '/search' },
  { id: 'finance', icon: Calculator, label: 'Tài chính', path: '/finance', requiredRoleMask: 16 },
  { id: 'finance-cashflow-dashboard', icon: BarChart3, label: 'Dashboard thu chi', path: '/finance/cashflow-dashboard', requiredRoleMask: 16 | 32 | 64 },
  { id: 'hr', icon: Users, label: 'Nhân sự', path: '/hr', requiredRoleMask: 32 | 64 },
  { id: 'dashboard', icon: BarChart3, label: 'Dashboard BGĐ', path: '/dashboard', requiredRoleMask: 32 | 64 },
  { id: 'admin', icon: Building2, label: 'Quản trị', path: '/admin', requiredRoleMask: 32 | 64 },
  { id: 'vendors', icon: Settings, label: 'Cấu hình NCC', path: '/admin/vendors', requiredRoleMask: 32 | 64 },
];

export const getVisibleMenu = (roleMask: number): SidebarItem[] =>
  sidebarMenu.filter(
    (item) => !item.requiredRoleMask || (Number(roleMask) & item.requiredRoleMask) !== 0,
  );

export const extraMenuItems: SidebarItem[] = [];
