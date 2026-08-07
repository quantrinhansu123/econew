import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { ModuleCard } from '../components/ui/ModuleCard';
import { useLocation, useNavigate } from 'react-router-dom';
import { getVisibleItems, moduleData } from '../data/moduleData';
import { sidebarMenu } from '../data/sidebarMenu';
import { getStoredAuthUser } from '../lib/authUser';
import WarehouseCustomerList from './warehouse/customers/WarehouseCustomerList';

type ModuleTab = 'tat-ca' | 'danh-dau' | 'khach-hang';

const ModulePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ModuleTab>('tat-ca');
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const isOrders = location.pathname === '/orders';
  const data = moduleData[location.pathname] || [];
  const currentItem = sidebarMenu.find((item) => item.path === location.pathname);
  const roleMask = getStoredAuthUser()?.role_mask ?? 0;

  const visibleSections = useMemo(
    () =>
      data
        .map(section => ({
          ...section,
          items: getVisibleItems(section, roleMask),
        }))
        .filter(section => section.items.length > 0),
    [data, roleMask],
  );

  useEffect(() => {
    const tab = (location.state as { tab?: ModuleTab } | null)?.tab;
    if (isOrders && tab === 'khach-hang') {
      setActiveTab('khach-hang');
    }
  }, [isOrders, location.state]);

  const searchPlaceholder =
    isOrders && activeTab === 'khach-hang'
      ? 'Tìm mã KH, tên, SĐT, địa chỉ...'
      : 'Tìm module theo tên hoặc mô tả...';

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="mb-4 flex items-center gap-3 sm:hidden">
        <button
          onClick={() => navigate('/')}
          className="-ml-1 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent"
          aria-label="Quay lại trang chủ"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-lg font-bold text-foreground">{currentItem?.label}</h1>
      </div>

      <div className="relative z-10 mb-4 flex flex-col items-stretch gap-2 rounded-xl border border-border bg-card p-2 shadow-sm sm:mb-6 sm:flex-row sm:items-center sm:gap-4">
        <button
          onClick={() => navigate('/')}
          className="hidden h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-[13px] font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted sm:flex"
        >
          <ChevronLeft size={16} />
          Quay lại
        </button>

        <div className="flex bg-muted rounded-lg p-1 w-full sm:w-auto overflow-x-auto">
          <button
            onClick={() => setActiveTab('tat-ca')}
            className={clsx(
              'min-h-10 flex-1 whitespace-nowrap rounded-md px-4 text-[13px] font-bold transition-all duration-200 sm:min-h-9 sm:flex-none',
              activeTab === 'tat-ca'
                ? 'bg-card text-primary shadow-sm ring-1 ring-black/5'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Tất cả
          </button>
          <button
            onClick={() => setActiveTab('danh-dau')}
            className={clsx(
              'min-h-10 flex-1 whitespace-nowrap rounded-md px-4 text-[13px] font-bold transition-all duration-200 sm:min-h-9 sm:flex-none',
              activeTab === 'danh-dau'
                ? 'bg-card text-primary shadow-sm ring-1 ring-black/5'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Đánh dấu
          </button>
          {isOrders && (
            <button
              onClick={() => setActiveTab('khach-hang')}
              className={clsx(
                'min-h-10 flex-1 whitespace-nowrap rounded-md px-4 text-[13px] font-bold transition-all duration-200 sm:min-h-9 sm:flex-none',
                activeTab === 'khach-hang'
                  ? 'bg-card text-primary shadow-sm ring-1 ring-black/5'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Danh sách Khách hàng
            </button>
          )}
        </div>

        <div className="relative flex-1 w-full">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-muted-foreground">
            <Search size={16} />
          </div>
          <input
            type="text"
            className="h-10 w-full rounded-lg border border-border bg-transparent pl-9 pr-4 text-[13px] transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {activeTab === 'khach-hang' && isOrders ? (
        <WarehouseCustomerList embedded keyword={searchQuery} />
      ) : activeTab === 'danh-dau' ? (
        <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border mt-4">
          Chưa có module nào được đánh dấu.
        </div>
      ) : visibleSections.length > 0 ? (
        <div className="space-y-8">
          {visibleSections.map((section, idx) => {
            const filteredItems = section.items.filter(
              (item) =>
                item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                item.description.toLowerCase().includes(searchQuery.toLowerCase()),
            );

            if (filteredItems.length === 0) return null;

            return (
              <div
                key={idx}
                className="animate-in fade-in slide-in-from-bottom-2 duration-500"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <h2 className="text-[14px] font-bold text-primary mb-3 flex items-center gap-3">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-1 h-4 bg-primary rounded-full"></span>
                    <span>{section.section}</span>
                  </div>
                  <div className="h-px flex-1 bg-border/60"></div>
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filteredItems.map((item, itemIdx) => (
                    <ModuleCard key={itemIdx} {...item} />
                  ))}
                </div>
              </div>
            );
          })}

          {searchQuery &&
            !visibleSections.some((s) =>
              s.items.some(
                (i) =>
                  i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  i.description.toLowerCase().includes(searchQuery.toLowerCase()),
              ),
            ) && (
              <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border">
                Không tìm thấy kết quả phù hợp cho &quot;{searchQuery}&quot;
              </div>
            )}
        </div>
      ) : (
        <div className="text-center py-16 text-muted-foreground bg-card/50 rounded-2xl border border-border border-dashed mt-4">
          Module này đang được phát triển...
        </div>
      )}
    </div>
  );
};

export default ModulePage;
