import type { HubSummary } from './types';

export function getDefaultOriginHubId(
  hubs: HubSummary[],
  assignedHubId?: string | number | null,
): string {
  const assigned = hubs.find((hub) => String(hub.id) === String(assignedHubId || ''));
  return String(
    assigned?.id
    || hubs.find((hub) => hub.code?.trim().toUpperCase() === 'HAN')?.id
    || hubs[0]?.id
    || '',
  );
}

/**
 * HCM là HUB tập kết mặc định. Nếu đơn được tạo ngay tại HCM thì chọn HUB
 * hoạt động khác để tránh tuyến có HUB gửi và HUB đến trùng nhau.
 */
export function getPreferredDestinationHub(
  hubs: HubSummary[],
  originHubId: string,
): HubSummary | null {
  return hubs.find((hub) =>
    hub.code?.trim().toUpperCase() === 'HCM'
    && String(hub.id) !== String(originHubId))
    || hubs.find((hub) => String(hub.id) !== String(originHubId))
    || null;
}
