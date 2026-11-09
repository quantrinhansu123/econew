import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEV_HRM_URL,
  DEFAULT_PRODUCTION_HRM_URL,
  getHrmBaseUrl,
  getHrmUrl,
  isStandaloneAppNavigationPath,
} from './hrmLink';

describe('hrmLink', () => {
  it('resolves base URL from env or falls back to /hrm', () => {
    expect(getHrmBaseUrl({ DEV: true, VITE_HRM_APP_URL: '' })).toBe(DEFAULT_DEV_HRM_URL);
    expect(getHrmBaseUrl({ DEV: false, VITE_HRM_APP_URL: '' })).toBe(DEFAULT_PRODUCTION_HRM_URL);
    expect(getHrmBaseUrl({ DEV: false, VITE_HRM_APP_URL: 'https://hrm-eco.vercel.app/' })).toBe(
      'https://hrm-eco.vercel.app',
    );
  });

  it('builds full HRM paths with eco_sso parameter', () => {
    expect(getHrmUrl('/cham-cong-online', { DEV: false })).toMatch(
      /^\/hrm\/cham-cong-online\?eco_sso=/,
    );
    expect(
      getHrmUrl('bang-cong-preview', {
        DEV: false,
        VITE_HRM_APP_URL: 'https://hrm-eco.vercel.app/',
      }),
    ).toMatch(/^https:\/\/hrm-eco\.vercel\.app\/bang-cong-preview\?eco_sso=/);
  });

  it('identifies standalone app paths that require full browser navigation', () => {
    expect(isStandaloneAppNavigationPath('/hrm/cham-cong-online?eco_sso=1')).toBe(true);
    expect(isStandaloneAppNavigationPath('https://hrm-eco.vercel.app/login')).toBe(true);
    expect(isStandaloneAppNavigationPath('/hr/attendance')).toBe(false);
  });
});
