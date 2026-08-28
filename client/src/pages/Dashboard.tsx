import React, { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { ActionCard } from '../components/ui/ActionCard';
import { getGreetingPeriod, getLoginDisplayName, getStoredAuthUser } from '../lib/authUser';
import { apiRequest } from '../lib/api';
import type { AuthUserProfile } from './login/types';
import type { TruckComplianceResponse } from './admin/trucks/types';
import { dashboardModules } from './dashboardModules';
import OperationalReminderPanel from './dashboard/OperationalReminderPanel';
import type { OperationalReminderResponse } from './dashboard/reminderTypes';

const MANAGER = 32;
const DIRECTOR = 64;

const Dashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chuc-nang' | 'danh-dau' | 'tat-ca'>('chuc-nang');
  const [user, setUser] = useState<AuthUserProfile | null>(() => getStoredAuthUser());
  const [truckCompliance, setTruckCompliance] = useState<TruckComplianceResponse | null>(null);
  const [reminders, setReminders] = useState<OperationalReminderResponse | null>(null);
  const loginName = getLoginDisplayName(user);
  const greetingPeriod = getGreetingPeriod();
  const roleMask = user?.role_mask ?? 0;
  const canManageReminders = (roleMask & (MANAGER | DIRECTOR)) !== 0;
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

  const loadAlerts = async () => {
    const [complianceResult, remindersResult] = await Promise.allSettled([
      apiRequest<TruckComplianceResponse>('/trucks/compliance-alerts'),
      apiRequest<OperationalReminderResponse>('/reminders'),
    ]);
    setTruckCompliance(complianceResult.status === 'fulfilled' ? complianceResult.value : null);
    setReminders(remindersResult.status === 'fulfilled' ? remindersResult.value : null);
  };

  useEffect(() => {
    queueMicrotask(() => void loadAlerts());
    window.addEventListener('focus', loadAlerts);
    return () => window.removeEventListener('focus', loadAlerts);
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Chào {greetingPeriod},{' '}
          <span className="text-primary">{loginName}</span> 👋
        </h1>
      </div>

      {(canManageReminders || (truckCompliance?.meta.total_alerts || 0) > 0 || (reminders?.meta.total || 0) > 0) && (
        <OperationalReminderPanel compliance={truckCompliance} reminders={reminders} canManage={canManageReminders} onRefresh={loadAlerts} />
      )}

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
