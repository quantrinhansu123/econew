export interface HubScopedUser {
  hub_id?: string | number | null;
  hub_ids?: Array<string | number> | null;
  hubs?: Array<{ id?: string | number | null }> | null;
  user_hubs?: Array<{
    hub_id?: string | number | null;
    hub?: { id?: string | number | null } | null;
  }> | null;
}

export function getAssignedHubIds(user: HubScopedUser): string[] {
  const values = [
    user.hub_id,
    ...(user.hub_ids ?? []),
    ...(user.hubs ?? []).map((hub) => hub.id),
    ...(user.user_hubs ?? []).flatMap((assignment) => [assignment.hub_id, assignment.hub?.id]),
  ];
  return [...new Set(
    values
      .filter((value) => value != null && String(value).trim())
      .map((value) => String(value)),
  )];
}

export function getDefaultHubId(user: HubScopedUser): string | undefined {
  return getAssignedHubIds(user)[0];
}

export function isAssignedToHub(user: HubScopedUser, hubId: string | number | null | undefined): boolean {
  if (hubId == null) return false;
  return getAssignedHubIds(user).includes(String(hubId));
}
