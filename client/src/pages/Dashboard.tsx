import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import { ActionCard } from '../components/ui/ActionCard';
import { getGreetingPeriod, getLoginDisplayName, getStoredAuthUser } from '../lib/authUser';
import { apiRequest } from '../lib/api';
import type { AuthUserProfile } from './login/types';
import type { TruckComplianceResponse } from './admin/trucks/types';
import { formatDateKey } from './admin/trucks/truckCompliance';
import { dashboardModules } from './dashboardModules';

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chuc-nang' | 'danh-dau' | 'tat-ca'>('chuc-nang');
  const [user, setUser] = useState<AuthUserProfile | null>(() => getStoredAuthUser());
  const [truckCompliance, setTruckCompliance] = useState<TruckComplianceResponse | null>(null);
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

  useEffect(() => {
    let active = true;
    const loadComplianceAlerts = async () => {
      try {
        const response = await apiRequest<TruckComplianceResponse>('/trucks/compliance-alerts');
        if (active) setTruckCompliance(response);
      } catch {
        if (active) setTruckCompliance(null);
      }
    };
    void loadComplianceAlerts();
    window.addEventListener('focus', loadComplianceAlerts);
    return () => { active = false; window.removeEventListener('focus', loadComplianceAlerts); };
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Chào {greetingPeriod},{' '}
          <span className="text-primary">{loginName}</span> 👋
        </h1>
      </div>

      {truckCompliance && truckCompliance.meta.total_alerts > 0 && <TruckComplianceAlertPanel compliance={truckCompliance} />}

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

function TruckComplianceAlertPanel({ compliance }: { compliance: TruckComplianceResponse }) {
  return <section className="mb-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm"><div className="flex flex-col gap-3 border-b border-amber-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800"><AlertTriangle size={20} /></div><div><h2 className="text-[14px] font-extrabold text-amber-950">Cảnh báo hạn đăng kiểm, bảo hiểm xe nội bộ</h2><p className="mt-0.5 text-[12px] font-medium text-amber-800">{compliance.meta.expired_alerts} quá hạn · {compliance.meta.due_soon_alerts} sắp hết hạn trong {compliance.warning_days} ngày</p></div></div><Link to="/fleet/internal-vehicles" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-amber-700 px-3 text-[12px] font-bold text-white hover:bg-amber-800">Xem danh sách xe <ArrowRight size={14} /></Link></div><div className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">{compliance.items.slice(0, 6).map((truck) => <div key={truck.id} className="rounded-xl border border-amber-200 bg-white px-3 py-2.5"><div className="flex items-center justify-between gap-2"><p className="text-[13px] font-extrabold text-slate-900">{truck.license_plate}</p><span className="text-[10px] font-bold text-slate-500">{truck.hub_code || 'Nội bộ'}</span></div><div className="mt-2 space-y-1">{truck.alerts.map((alert) => <div key={alert.type} className={clsx('flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] font-bold', alert.status === 'EXPIRED' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800')}><span className="inline-flex items-center gap-1"><CalendarClock size={12} />{alert.label}: {formatDateKey(alert.expiry_date)}</span><span>{alert.days_remaining < 0 ? `Quá ${Math.abs(alert.days_remaining)} ngày` : alert.days_remaining === 0 ? 'Hôm nay' : `Còn ${alert.days_remaining} ngày`}</span></div>)}</div></div>)}</div></section>;
}
