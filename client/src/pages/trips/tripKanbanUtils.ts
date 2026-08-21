import type { Trip, TripAction } from './types';

export const getPrimaryTripAction = (status?: string | null): TripAction | null => {
  if (status === 'PLANNED') return 'start';
  if (status === 'IN_TRANSIT') return 'arrive';
  if (status === 'ARRIVED') return 'complete';
  return null;
};

export const getTripDeleteDisabledReason = (trip: Trip): string | null => {
  const attachedWaybills = trip.delivery_summary?.total_waybills;
  if (attachedWaybills == null) return 'Chưa xác định được số đơn đang gắn với chuyến';
  if (attachedWaybills > 0) {
    return `Phải nhả hết ${attachedWaybills.toLocaleString('vi-VN')} đơn/kiện về trước khi xóa`;
  }
  return null;
};
