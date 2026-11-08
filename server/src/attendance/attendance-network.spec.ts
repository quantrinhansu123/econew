import { isPublicIp, matchesNetwork, normalizeIp, normalizeNetwork } from './attendance-network';

describe('attendance network matching', () => {
  it('normalizes IPv4-mapped and equivalent IPv6 addresses', () => {
    expect(normalizeIp('::ffff:8.8.8.8')).toBe('8.8.8.8');
    expect(normalizeIp('::ffff:808:808')).toBe('8.8.8.8');
    expect(normalizeIp('2606:4700:0000:0000:0000:0000:0000:1111')).toBe('2606:4700::1111');
    expect(matchesNetwork('::ffff:8.8.8.8', '8.8.8.8')).toBe(true);
    expect(matchesNetwork('2606:4700::1111', '2606:4700:0:0:0:0:0:1111')).toBe(true);
  });

  it.each(['127.0.0.1', '::1', '192.168.1.4', '10.0.0.1', '100.64.1.2', '169.254.1.1', '172.16.1.1', '224.0.0.1', '255.255.255.255', 'fc00::1', 'fe80::1', '2001:db8::1', 'bad', '8.8.8.8, 1.1.1.1', 'fe80::1%eth0'])('rejects non-public or malformed address %s', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
    expect(normalizeNetwork(ip)).toBeNull();
  });

  it('matches only the configured address or explicitly configured IPv6 prefix', () => {
    expect(matchesNetwork('1.1.1.1', '8.8.8.8')).toBe(false);
    expect(matchesNetwork('2606:4700:1234:1::abcd', '2606:4700:1234:1::/64')).toBe(true);
    expect(matchesNetwork('2606:4700:1234:2::abcd', '2606:4700:1234:1::/64')).toBe(false);
    expect(normalizeNetwork('0.0.0.0/0')).toBeNull();
    expect(normalizeNetwork('8.8.8.8/24')).toBeNull();
    expect(normalizeNetwork('2606:4700::/0')).toBeNull();
    expect(normalizeNetwork('2606:4700::/129')).toBeNull();
    expect(matchesNetwork(null, '8.8.8.8')).toBe(false);
  });
});
