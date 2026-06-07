import { useState } from 'react';
import { Building2, Edit, Eye, GripVertical, MapPin, Plus, Power, Tag, Trash2, Truck as TruckIcon, User } from 'lucide-react';
import { clsx } from 'clsx';
import { getKanbanColumnAccent } from './data';
import type { Truck, TruckKanbanColumn } from './types';

const statusColor: Record<string, string> = {
  AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_TRIP: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  IN_USE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  MAINTENANCE: 'bg-amber-50 text-amber-700 border-amber-200',
  INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
};

const displayBks = (truck: Truck) => truck.bks || truck.license_plate || '—';

interface Props {
  columns: TruckKanbanColumn[];
  canManage: boolean;
  canDelete: boolean;
  formatStatus: (status?: string | null) => string;
  getDriverName: (truck: Truck) => string;
  onOpenDetail: (truck: Truck) => void;
  onViewOrders: (truck: Truck) => void;
  onEdit: (truck: Truck) => void;
  onStatus: (truck: Truck, status: string) => void;
  onDelete: (truck: Truck) => void;
  onAddToColumn?: (columnId: string) => void;
  onMoveKhuVuc?: (truck: Truck, columnId: string) => void;
}

export default function TrucksKanbanBoard({
  columns,
  canManage,
  canDelete,
  formatStatus,
  getDriverName,
  onOpenDetail,
  onViewOrders,
  onEdit,
  onStatus,
  onDelete,
  onAddToColumn,
  onMoveKhuVuc,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  function handleDragStart(truck: Truck) {
    if (!canManage || !onMoveKhuVuc) return;
    setDraggingId(truck.id);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <div className="flex h-full min-h-0 gap-3 overflow-x-auto overflow-y-hidden p-3 custom-scrollbar">
      {columns.map((column, index) => {
        const isDropTarget = dropTargetId === column.id && draggingId != null;
        return (
          <section
            key={column.id}
            className={clsx(
              'flex w-[min(100%,300px)] shrink-0 flex-col rounded-2xl border border-border border-t-4 bg-slate-50/80 shadow-sm',
              getKanbanColumnAccent(index),
              isDropTarget && 'ring-2 ring-primary ring-offset-2',
            )}
            onDragOver={(event) => {
              if (!canManage || !onMoveKhuVuc || draggingId == null) return;
              event.preventDefault();
              setDropTargetId(column.id);
            }}
            onDragLeave={() => {
              if (dropTargetId === column.id) setDropTargetId(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!canManage || !onMoveKhuVuc || draggingId == null) return;
              const truck = columns.flatMap((c) => c.trucks).find((t) => t.id === draggingId);
              if (truck) onMoveKhuVuc(truck, column.id);
              handleDragEnd();
            }}
          >
            <header className="flex items-start justify-between gap-2 border-b border-border/60 bg-white/70 px-3 py-3 rounded-t-xl">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-primary">
                  <MapPin size={14} className="shrink-0" />
                  <h3 className="truncate text-[13px] font-extrabold text-foreground">{column.label}</h3>
                </div>
                <p className="mt-0.5 text-[11px] font-bold text-muted-foreground">{column.trucks.length} xe</p>
              </div>
              {canManage && onAddToColumn && (
                <button
                  type="button"
                  title={`Thêm xe vào ${column.label}`}
                  onClick={() => onAddToColumn(column.id)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-primary hover:bg-primary/5"
                >
                  <Plus size={15} />
                </button>
              )}
            </header>

            <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2 custom-scrollbar">
              {column.trucks.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-white/60 px-3 py-8 text-center">
                  <TruckIcon size={20} className="mb-2 text-muted-foreground/50" />
                  <p className="text-[12px] font-bold text-muted-foreground">Chưa có xe</p>
                </div>
              ) : (
                column.trucks.map((truck) => (
                  <article
                    key={truck.id}
                    draggable={canManage && Boolean(onMoveKhuVuc)}
                    onDragStart={() => handleDragStart(truck)}
                    onDragEnd={handleDragEnd}
                    onClick={() => onOpenDetail(truck)}
                    className={clsx(
                      'group cursor-pointer rounded-xl border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md',
                      draggingId === truck.id && 'opacity-50',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {canManage && onMoveKhuVuc && (
                        <GripVertical
                          size={14}
                          className="mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-muted-foreground"
                        />
                      )}
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[14px] font-extrabold text-foreground">{displayBks(truck)}</p>
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-muted-foreground">
                              <User size={11} />
                              {getDriverName(truck)}
                            </p>
                          </div>
                          <StatusBadge status={truck.status} label={formatStatus(truck.status)} />
                        </div>

                        <div className="space-y-1 text-[11px] font-medium text-muted-foreground">
                          {truck.nha_xe && (
                            <p className="flex items-center gap-1 truncate">
                              <Building2 size={11} />
                              {truck.nha_xe}
                            </p>
                          )}
                          {truck.loai_xe && (
                            <p className="flex items-center gap-1 truncate">
                              <Tag size={11} />
                              {truck.loai_xe}
                            </p>
                          )}
                          {truck.payload != null && (
                            <p className="font-bold text-foreground/80">
                              {Number(truck.payload).toLocaleString('vi-VN')} kg
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 pt-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            title="Xem đơn phụ trách"
                            aria-label="Xem đơn phụ trách"
                            onClick={() => onViewOrders(truck)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => onEdit(truck)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-primary disabled:opacity-40"
                          >
                            <Edit size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={!canManage}
                            onClick={() => onStatus(truck, truck.status === 'AVAILABLE' ? 'INACTIVE' : 'AVAILABLE')}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-amber-600 disabled:opacity-40"
                          >
                            <Power size={13} />
                          </button>
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => onDelete(truck)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function StatusBadge({ status, label }: { status?: string | null; label: string }) {
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold',
        statusColor[status || ''] || 'bg-slate-50 text-slate-600 border-slate-200',
      )}
    >
      {label}
    </span>
  );
}
