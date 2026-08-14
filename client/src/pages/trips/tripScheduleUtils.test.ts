import { describe, expect, it } from 'vitest';
import { buildTripScheduleRouteStops, expectedArrivalOffsetDays, toLocalDateTimeInput } from './tripScheduleUtils';

describe('toLocalDateTimeInput', () => {
  it('giữ đúng thời điểm khi đổi sang input datetime-local', () => {
    const source = '2026-08-07T08:30:00.000Z';
    const localValue = toLocalDateTimeInput(source);
    expect(new Date(localValue).toISOString()).toBe(source);
  });

  it('trả rỗng với ngày không hợp lệ', () => {
    expect(toLocalDateTimeInput('khong-phai-ngay')).toBe('');
    expect(toLocalDateTimeInput(null)).toBe('');
  });
});

describe('lịch dự kiến đến theo HUB', () => {
  it('áp đúng số ngày mặc định theo từng khu vực', () => {
    expect(expectedArrivalOffsetDays({ hub_name: 'Đà Nẵng' })).toBe(1);
    expect(expectedArrivalOffsetDays({ hub_code: 'QUANGNAM' })).toBe(1);
    expect(expectedArrivalOffsetDays({ hub_name: 'Khánh Hòa' })).toBe(2);
    expect(expectedArrivalOffsetDays({ hub_code: 'BINHTHUAN' })).toBe(2);
    expect(expectedArrivalOffsetDays({ hub_code: 'HCM' })).toBe(3);
  });

  it('ưu tiên số ngày đã cấu hình tại bưu cục', () => {
    expect(expectedArrivalOffsetDays({ hub_code: 'HCM', transit_days: 5 })).toBe(5);
    expect(expectedArrivalOffsetDays({ hub_name: 'Đà Nẵng', transit_days: 2 })).toBe(2);
  });

  it('thay giờ chung kiểu cũ bằng ngày mặc định riêng cho từng HUB', () => {
    const departure = '2026-08-05T16:48';
    const sharedLegacyTime = '2026-08-08T16:48:00.000Z';
    const stops = buildTripScheduleRouteStops({
      id: '44',
      end_hub_id: '3',
      route_stops: [
        { hub_id: '2', hub_code: 'DANANG', expected_arrival_at: sharedLegacyTime },
        { hub_id: '3', hub_code: 'KHANHHOA', expected_arrival_at: sharedLegacyTime },
        { hub_id: '4', hub_code: 'HCM', expected_arrival_at: sharedLegacyTime },
      ],
    }, departure);

    expect(stops.map((stop) => new Date(stop.expected_arrival_at).getDate())).toEqual([6, 7, 8]);
  });

  it('tạo lịch từng điểm dừng theo cấu hình bưu cục', () => {
    const stops = buildTripScheduleRouteStops({
      id: '45',
      end_hub_id: '4',
      route_stops: [
        { hub_id: '2', hub_code: 'DAN', transit_days: 1, expected_arrival_at: null },
        { hub_id: '3', hub_code: 'KHANHHOA', transit_days: 2, expected_arrival_at: null },
        { hub_id: '4', hub_code: 'HCM', transit_days: 3, expected_arrival_at: null },
      ],
    }, '2026-08-14T08:00');

    expect(stops.map((stop) => new Date(stop.expected_arrival_at).getDate())).toEqual([15, 16, 17]);
  });
});
