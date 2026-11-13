export const SALARY_ADVANCES_CHANGED_EVENT = 'eco:salary-advances-changed';
export const SALARY_ADVANCES_CHANGED_STORAGE_KEY = 'eco_salary_advances_changed_at';

export function notifySalaryAdvancesChanged() {
  window.dispatchEvent(new Event(SALARY_ADVANCES_CHANGED_EVENT));
  try {
    window.localStorage.setItem(SALARY_ADVANCES_CHANGED_STORAGE_KEY, String(Date.now()));
  } catch {
    // The in-page event still refreshes payroll when storage is unavailable.
  }
}
