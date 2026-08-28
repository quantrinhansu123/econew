export type TruckComplianceState = 'MISSING' | 'EXPIRED' | 'DUE_SOON' | 'VALID';

export interface TruckExpiryInfo {
  date: string | null;
  daysRemaining: number | null;
  state: TruckComplianceState;
}

export const getVietnamDateKey = (now = new Date()) => new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

export function getTruckExpiryInfo(expiryDate?: string | null, today = getVietnamDateKey(), warningDays = 15): TruckExpiryInfo {
  if (!expiryDate) return { date: null, daysRemaining: null, state: 'MISSING' };
  const daysRemaining = Math.round((Date.parse(`${expiryDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return {
    date: expiryDate,
    daysRemaining,
    state: daysRemaining < 0 ? 'EXPIRED' : daysRemaining <= warningDays ? 'DUE_SOON' : 'VALID',
  };
}

export function formatDateKey(value?: string | null): string {
  if (!value) return 'Chưa nhập';
  const [year, month, day] = value.slice(0, 10).split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

export function formatExpiryMessage(info: TruckExpiryInfo): string {
  if (info.state === 'MISSING') return 'Chưa nhập';
  if (info.state === 'EXPIRED') return `Quá hạn ${Math.abs(info.daysRemaining ?? 0)} ngày`;
  if (info.state === 'DUE_SOON') return info.daysRemaining === 0 ? 'Hết hạn hôm nay' : `Còn ${info.daysRemaining} ngày`;
  return formatDateKey(info.date);
}
