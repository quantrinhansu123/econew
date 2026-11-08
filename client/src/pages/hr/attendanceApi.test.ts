import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from '../../lib/api';
import { submitAttendanceCheck } from './attendanceApi';

vi.mock('../../lib/api', () => ({ apiRequest: vi.fn() }));

describe('one-button attendance', () => {
  const request = vi.mocked(apiRequest);
  const getCurrentPosition = vi.fn();
  const progress = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('checks in on a registered network without requesting GPS or sending an IP', async () => {
    request.mockResolvedValueOnce({ ip: '8.8.8.8', is_public: true, matched_location: { id: '1', name: 'HAN' }, gps_available: true }).mockResolvedValueOnce({ success: true });
    await submitAttendanceCheck('check_in', progress);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(request).toHaveBeenNthCalledWith(2, '/attendance/check', { method: 'POST', body: { type: 'check_in' } });
  });

  it('requests fresh coordinates when a GPS point is available and the network does not match', async () => {
    request.mockResolvedValueOnce({ matched_location: null, gps_available: true }).mockResolvedValueOnce({ success: true });
    getCurrentPosition.mockImplementationOnce((resolve) => resolve({ coords: { latitude: 21, longitude: 105, accuracy: 10 } }));
    await submitAttendanceCheck('check_out', progress);
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
    expect(request).toHaveBeenLastCalledWith('/attendance/check', { method: 'POST', body: { type: 'check_out', latitude: 21, longitude: 105, accuracy: 10 } });
  });

  it('lets the server reject and audit an unregistered network without asking for GPS at an IP-only office', async () => {
    request.mockResolvedValueOnce({ matched_location: null, gps_available: false }).mockRejectedValueOnce(new Error('NETWORK_NOT_ALLOWED'));
    await expect(submitAttendanceCheck('check_in', progress)).rejects.toThrow('NETWORK_NOT_ALLOWED');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('refreshes the network on every attempt instead of reusing an earlier Wi-Fi match', async () => {
    request.mockResolvedValueOnce({ matched_location: { id: '1', name: 'HAN' }, gps_available: false }).mockResolvedValueOnce({ success: true });
    await submitAttendanceCheck('check_in', progress);
    request.mockResolvedValueOnce({ matched_location: null, gps_available: false }).mockRejectedValueOnce(new Error('NETWORK_NOT_ALLOWED'));
    await expect(submitAttendanceCheck('check_out', progress)).rejects.toThrow('NETWORK_NOT_ALLOWED');
    expect(request.mock.calls.filter(([path]) => path === '/attendance/network')).toHaveLength(2);
  });

  it('does not submit attendance when location permission is denied', async () => {
    request.mockResolvedValueOnce({ matched_location: null, gps_available: true });
    getCurrentPosition.mockImplementationOnce((_resolve, reject) => reject({ code: 1 }));
    await expect(submitAttendanceCheck('check_in', progress)).rejects.toEqual({ code: 1 });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
