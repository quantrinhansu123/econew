import { describe, expect, it } from 'vitest';
import { DEFAULT_DEV_HRM_URL, DEFAULT_PRODUCTION_HRM_URL, getHrmBaseUrl, getHrmUrl } from './hrmLink';

describe('hrmLink', () => {
  it('uses configured VITE_HRM_APP_URL when provided', () => {
    expect(getHrmBaseUrl({ DEV: true, VITE_HRM_APP_URL: 'https://hrm.eco.vn/' })).toBe('https://hrm.eco.vn');
    expect(getHrmUrl('/cham-cong-online', { DEV: false, VITE_HRM_APP_URL: 'https://hrm.eco.vn/' })).toBe(
      'https://hrm.eco.vn/cham-cong-online',
    );
  });

  it('falls back to dev and production defaults', () => {
    expect(getHrmBaseUrl({ DEV: true })).toBe(DEFAULT_DEV_HRM_URL);
    expect(getHrmBaseUrl({ DEV: false })).toBe(DEFAULT_PRODUCTION_HRM_URL);
  });
});

