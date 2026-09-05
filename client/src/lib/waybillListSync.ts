export const WAYBILL_LIST_CHANGED_EVENT = 'eco:waybill-list-changed';
export const WAYBILL_LIST_CHANGED_STORAGE_KEY = 'eco_waybill_list_changed_at';

export function notifyWaybillListChanged() {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new Event(WAYBILL_LIST_CHANGED_EVENT));
  try {
    window.localStorage.setItem(WAYBILL_LIST_CHANGED_STORAGE_KEY, String(Date.now()));
  } catch {
    // The in-page event still refreshes the current tab when storage is unavailable.
  }
}
