import { describe, expect, it } from 'vitest';
import { resolveDeliveryProcessingStatus, resolveDeliveryProcessingText } from './deliveryProcessingStatus';

describe('deliveryProcessingStatus', () => {
  it('hiển thị đúng trạng thái khách tới HUB lấy', () => {
    expect(resolveDeliveryProcessingStatus({
      current_state: 'AT_DEST_HUB',
      delivery_preparation_status: 'READY',
      delivery_assignment_type: 'CUSTOMER_PICKUP',
      delivery_preparation_note: 'Gọi khách trước 15 phút',
    })).toMatchObject({
      title: 'Sẵn sàng giao · khách tới lấy',
      detail: 'Không cần điều phối xe',
      note: 'Gọi khách trước 15 phút',
    });
  });

  it.each([
    ['INTERNAL', 'Đã điều phối · xe nội bộ'],
    ['PARTNER', 'Đã điều phối · xe đối tác'],
    ['TECHNOLOGY', 'Đã điều phối · xe công nghệ'],
  ] as const)('hiển thị đúng loại điều phối %s', (assignmentType, expected) => {
    expect(resolveDeliveryProcessingStatus({
      current_state: 'OUT_FOR_DELIVERY',
      delivery_assignment_type: assignmentType,
    }).title).toBe(expected);
  });

  it('gộp ngày hẹn và ghi chú vào nội dung tra cứu', () => {
    const text = resolveDeliveryProcessingText({
      current_state: 'AT_DEST_HUB',
      delivery_preparation_status: 'SCHEDULED',
      delivery_scheduled_at: '2026-08-14T11:00:00.000Z',
      delivery_preparation_note: 'Khách hẹn ngày giao',
    });

    expect(text).toContain('Lưu kho · hẹn ngày giao');
    expect(text).toContain('Khách hẹn ngày giao');
  });

  it('ưu tiên trạng thái phát thành công sau khi hoàn tất', () => {
    expect(resolveDeliveryProcessingStatus({
      current_state: 'DELIVERED',
      delivery_assignment_type: 'CUSTOMER_PICKUP',
    })).toMatchObject({
      title: 'Phát thành công',
      detail: 'Khách đã tới HUB lấy hàng',
      tone: 'emerald',
    });
  });
});
