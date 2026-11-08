import { apiRequest } from '../../lib/api';
import type { AttendanceCheckResponse, AttendanceLog, AttendanceNetworkStatus } from './attendanceTypes';

export const getAttendanceNetwork = () => apiRequest<AttendanceNetworkStatus>('/attendance/network');

export async function submitAttendanceCheck(type: AttendanceLog['type'], onProgress: (message: string) => void) {
  onProgress('Đang kiểm tra mạng chấm công...');
  // Refresh on every click: the phone may have switched between Wi-Fi and mobile data.
  const network = await getAttendanceNetwork();
  const body: { type: AttendanceLog['type']; latitude?: number; longitude?: number; accuracy?: number } = { type };
  if (!network.matched_location && network.gps_available) {
    onProgress('Đang xin quyền vị trí và lấy tọa độ hiện tại...');
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ GPS.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 });
    });
    body.latitude = position.coords.latitude;
    body.longitude = position.coords.longitude;
    body.accuracy = position.coords.accuracy;
  }
  // The server validates the actual request IP again; the client never supplies it.
  const result = await apiRequest<AttendanceCheckResponse>('/attendance/check', { method: 'POST', body });
  return { result, network };
}
