import { AlertTriangle, ArrowLeft, Loader2, RefreshCw, Truck as TruckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatUpdatedAt } from './incomingTripUtils';
import { IncomingStateBlock } from './IncomingTripTable';

export function IncomingTripsPageLayout({
  title,
  subtitle,
  isLoading,
  error,
  updatedAt,
  children,
}: {
  title: string;
  subtitle: string;
  isLoading: boolean;
  error: string;
  updatedAt: Date | null;
  children: ReactNode;
}) {
  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 flex items-center gap-2 shrink-0">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
        <div className="border-b border-border bg-card p-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="h-9 w-9 shrink-0 rounded-lg border border-border bg-muted/10 text-muted-foreground hover:bg-muted flex items-center justify-center md:w-auto md:px-3 md:gap-2"
            >
              <ArrowLeft size={15} />
              <span className="hidden md:inline text-[13px] font-medium">Quay lại</span>
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
                <TruckIcon size={17} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-[15px] font-extrabold text-foreground md:text-[17px]">{title}</h1>
                <p className="hidden text-[12px] font-medium text-muted-foreground md:block">{subtitle}</p>
              </div>
            </div>
            <div className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 text-[11px] font-bold text-muted-foreground">
              <RefreshCw size={13} className={isLoading ? 'animate-spin text-primary' : 'text-primary'} />
              <span>{formatUpdatedAt(updatedAt)}</span>
            </div>
          </div>
        </div>

        {isLoading ? (
          <IncomingStateBlock icon={<Loader2 className="animate-spin" size={22} />} title="Đang tải danh sách xe" />
        ) : (
          <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3 md:p-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
