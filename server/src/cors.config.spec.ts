import { isAllowedCorsOrigin, resolveCorsOriginList } from './cors.config';

describe('cors.config', () => {
  const original = process.env.CORS_ORIGIN;

  afterEach(() => {
    if (original === undefined) delete process.env.CORS_ORIGIN;
    else process.env.CORS_ORIGIN = original;
  });

  it('allows production frontend and preview URLs', () => {
    expect(isAllowedCorsOrigin('https://eco-webapp.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://eco-webapp-git-main-htung0403.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://econew-six.vercel.app')).toBe(true);
    expect(isAllowedCorsOrigin('https://eco-transport-api.onrender.com')).toBe(true);
  });

  it('merges env origins with built-in production URLs', () => {
    process.env.CORS_ORIGIN = 'http://localhost:6060';
    const origins = resolveCorsOriginList();
    expect(origins).toContain('http://localhost:6060');
    expect(origins).toContain('https://eco-webapp.vercel.app');
  });
});
