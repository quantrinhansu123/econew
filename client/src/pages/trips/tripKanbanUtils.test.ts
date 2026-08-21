import { describe, expect, it } from 'vitest';
import { getTripDeleteDisabledReason } from './tripKanbanUtils';

describe('getTripDeleteDisabledReason', () => {
  it('cho phép xóa khi chuyến đã nhả hết đơn', () => {
    expect(getTripDeleteDisabledReason({
      id: 1,
      delivery_summary: {
        total_waybills: 0,
        processed_waybills: 0,
        delivered_waybills: 0,
        pending_delivery_waybills: 0,
        completed_waybills: 0,
      },
    })).toBeNull();
  });

  it('khóa xóa khi vẫn còn đơn trong chuyến', () => {
    expect(getTripDeleteDisabledReason({
      id: 2,
      delivery_summary: {
        total_waybills: 3,
        processed_waybills: 2,
        delivered_waybills: 1,
        pending_delivery_waybills: 2,
        completed_waybills: 1,
      },
    })).toContain('3 đơn/kiện');
  });

  it('khóa xóa nếu API chưa trả về số đơn liên kết', () => {
    expect(getTripDeleteDisabledReason({ id: 3 })).toBe('Chưa xác định được số đơn đang gắn với chuyến');
  });
});
