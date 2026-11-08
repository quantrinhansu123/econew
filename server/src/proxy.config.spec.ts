import { getTrustProxyConfig } from './proxy.config';

describe('trusted proxy configuration', () => {
  it('trusts no forwarded headers outside a configured deployment', () => {
    expect(getTrustProxyConfig({})).toBe(false);
    expect(getTrustProxyConfig({ RENDER: 'true', TRUSTED_PROXY_CIDRS: '' })).toBe(false);
  });
  it('uses explicit addresses rather than trusting all headers or a hop count', () => {
    expect(getTrustProxyConfig({ TRUSTED_PROXY_CIDRS: '127.0.0.1, 10.1.0.0/16' })).toEqual(['127.0.0.1', '10.1.0.0/16']);
    for (const config of ['true', '1', '0.0.0.0/0', '::/0']) {
      expect(() => getTrustProxyConfig({ TRUSTED_PROXY_CIDRS: config })).toThrow();
    }
  });
});
