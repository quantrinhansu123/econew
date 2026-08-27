import type { HubSummary } from './types';

export function getDefaultOriginHubId(
  hubs: HubSummary[],
  assignedHubIds: Array<string | number> = [],
): string {
  const assigned = assignedHubIds.length === 1
    ? hubs.find((hub) => String(hub.id) === String(assignedHubIds[0]))
    : undefined;
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
