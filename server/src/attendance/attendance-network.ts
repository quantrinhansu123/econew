import { BlockList, isIP } from 'node:net';

export function normalizeIp(value?: string | null): string | null {
  const ip = value?.trim();
  if (!ip || !isIP(ip) || ip.includes('%')) return null;
  if (isIP(ip) === 4) return ip;
  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = canonical.match(/^::ffff:([\da-f]{1,4}):([\da-f]{1,4})$/);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16);
  const low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}

const nonPublic = new BlockList();
for (const [ip, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) nonPublic.addSubnet(ip, prefix, 'ipv4');
nonPublic.addSubnet('2001:db8::', 32, 'ipv6');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');

export function isPublicIp(value?: string | null): boolean {
  const ip = normalizeIp(value);
  if (!ip) return false;
  return isIP(ip) === 4
    ? !nonPublic.check(ip, 'ipv4')
    : globalV6.check(ip, 'ipv6') && !nonPublic.check(ip, 'ipv6');
}

// IPv4 entries are exact public addresses. IPv6 also permits an explicitly
// configured office prefix (48..128), because device IPv6 addresses can differ.
export function normalizeNetwork(value: string): string | null {
  const parts = value.trim().split('/');
  const ip = normalizeIp(parts[0]);
  if (!ip || !isPublicIp(ip) || parts.length > 2) return null;
  if (parts.length === 1) return ip;
  if (isIP(ip) !== 6 || !/^\d+$/.test(parts[1])) return null;
  const prefix = Number(parts[1]);
  if (prefix < 48 || prefix > 128) return null;
  return `${ip}/${prefix}`;
}

export function matchesNetwork(ip: string | null, network: string): boolean {
  if (!ip || !isPublicIp(ip)) return false;
  const normalized = normalizeNetwork(network);
  if (!normalized) return false;
  if (!normalized.includes('/')) return normalizeIp(ip) === normalized;
  const [address, prefix] = normalized.split('/');
  const block = new BlockList();
  block.addSubnet(address, Number(prefix), 'ipv6');
  return block.check(normalizeIp(ip)!, isIP(normalizeIp(ip)!) === 6 ? 'ipv6' : 'ipv4');
}
