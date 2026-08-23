import { useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, History, Loader2, Search, Truck, X } from 'lucide-react';
import { ApiError, apiRequest } from '../../../../lib/api';
import { ConfirmDialog, type ConfirmDialogState } from '../../../../components/ui/ConfirmDialog';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import type { FilterOption, Truck as TruckRecord, TruckListResponse } from '../types';

interface Props {
  hubOptions: FilterOption[];
  onClose: () => void;
  onRestored: () => void | Promise<void>;
}

const normalizeList = (response: TruckListResponse | TruckRecord[]) => (
  Array.isArray(response) ? response : response.items || response.data || response.trucks || []
);

export default function RestoreInternalTruckDialog({ hubOptions, onClose, onRestored }: Props) {
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<TruckRecord[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [hubId, setHubId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
  const selectedTruck = results.find((truck) => String(truck.id) === selectedId);

  async function searchLegacyTrucks() {
    const query = keyword.trim().toUpperCase();
    if (!query) {
      setError('Nhập BKS cần khôi phục.');
      return;
    }
    setIsSearching(true);
    setError('');
    setSelectedId('');
    try {
      const params = new URLSearchParams({ keyword: query, page: '1', limit: '20' });
      const response = await apiRequest<TruckListResponse | TruckRecord[]>(`/trucks/legacy?${params.toString()}`);
      setResults(normalizeList(response));
      setHasSearched(true);
    } catch (searchError) {
      setResults([]);
      setHasSearched(true);
      setError(searchError instanceof ApiError ? searchError.message : 'Không tìm được dữ liệu xe cũ.');
    } finally {
      setIsSearching(false);
    }
  }

  async function restoreTruck() {
    if (!selectedId || !hubId) {
      setError('Chọn đúng BKS cũ và bưu cục hoạt động.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      await apiRequest(`/trucks/${selectedId}/restore-internal`, { method: 'PATCH', body: { hub_id: hubId } });
      await onRestored();
      onClose();
    } catch (restoreError) {
      setError(restoreError instanceof ApiError ? restoreError.message : 'Không thể khôi phục BKS cũ.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmRestore() {
    if (!selectedTruck || !hubId) {
      setError('Chọn đúng BKS cũ và bưu cục hoạt động.');
      return;
    }
    setConfirmDialog({
      title: 'Khôi phục BKS xe nội bộ',
      message: `Xác nhận chuyển ${selectedTruck.license_plate} về danh sách xe nội bộ? Thông tin NCC và tài xế cũ vẫn được giữ trên các chuyến đã phát sinh.`,
      confirmLabel: 'Khôi phục',
      onConfirm: restoreTruck,
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex justify-end">
      <div className="fixed inset-0 bg-black/40 backdrop-blur-md" onClick={isSubmitting ? undefined : onClose} />
      <section className="relative flex h-screen w-full max-w-[620px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl dialog-slide-in">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-white px-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Dữ liệu xe cũ</p>
            <h2 className="text-lg font-extrabold text-foreground">Khôi phục BKS xe nội bộ</h2>
          </div>
          <button type="button" title="Đóng" onClick={onClose} disabled={isSubmitting} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50"><X size={19} /></button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 custom-scrollbar">
          {error && <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800"><AlertTriangle size={16} />{error}</div>}

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={keyword} onChange={(event) => setKeyword(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') void searchLegacyTrucks(); }} placeholder="Nhập BKS cũ, ví dụ 29K-124.21" className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10" />
            </div>
            <button type="button" onClick={() => void searchLegacyTrucks()} disabled={isSearching} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-60">{isSearching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}Tìm</button>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            {results.map((truck) => {
              const id = String(truck.id);
              const selected = id === selectedId;
              return (
                <button key={id} type="button" onClick={() => setSelectedId(id)} className={`flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left last:border-b-0 ${selected ? 'bg-blue-50' : 'hover:bg-muted/30'}`}>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${selected ? 'border-primary bg-primary text-white' : 'border-blue-200 bg-blue-50 text-primary'}`}><Truck size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-extrabold text-foreground">{truck.license_plate}</span>
                    <span className="block truncate text-[12px] text-muted-foreground">{truck.vendor?.name || truck.vendor?.code || 'Dữ liệu cũ chưa phân loại'} · {truck.payload || 0} kg</span>
                  </span>
                  <input type="radio" checked={selected} readOnly className="h-4 w-4 accent-primary" />
                </button>
              );
            })}
            {hasSearched && !results.length && !isSearching && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground">Không tìm thấy BKS cũ phù hợp.</div>}
            {!hasSearched && <div className="px-4 py-10 text-center text-[13px] text-muted-foreground"><History size={22} className="mx-auto mb-2 text-primary" />Tìm BKS đã nhập trước đây.</div>}
          </div>

          <div className="rounded-lg border border-border bg-white p-4">
            <label className="mb-2 block text-[13px] font-bold text-foreground">Bưu cục hoạt động</label>
            <SearchableSelect value={hubId} options={hubOptions} onValueChange={setHubId} placeholder="Chọn Hà Nội hoặc TP.HCM" />
          </div>
        </div>

        <footer className="flex shrink-0 justify-end gap-3 border-t border-border bg-white p-5">
          <button type="button" onClick={onClose} disabled={isSubmitting} className="h-10 rounded-lg border border-border bg-white px-4 text-[13px] font-bold text-muted-foreground disabled:opacity-50">Hủy</button>
          <button type="button" onClick={confirmRestore} disabled={isSubmitting || !selectedId || !hubId} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:opacity-50">{isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <History size={16} />}Khôi phục</button>
        </footer>
        <ConfirmDialog dialog={confirmDialog} isSubmitting={isSubmitting} onClose={() => setConfirmDialog(null)} />
      </section>
    </div>,
    document.body,
  );
}
