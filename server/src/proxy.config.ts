import type { Request } from 'express';

// Render's ingress uses Cloudflare and private load balancers. Walk X-Forwarded-For
// from the trusted end; never trust a client-supplied left-most address blindly.
// Sources: https://render.com/articles/how-render-handles-ddos-attacks
// https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6
const RENDER_PROXIES = [
  'loopback', 'linklocal', 'uniquelocal',
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

export function getTrustProxyConfig(env: NodeJS.ProcessEnv = process.env): string[] | false {
  // An explicit list replaces the platform defaults. Never accept true or hop counts.
  if (env.TRUSTED_PROXY_CIDRS !== undefined) {
    const proxies = env.TRUSTED_PROXY_CIDRS.split(',').map((value) => value.trim()).filter(Boolean);
    if (proxies.some((value) => value === 'true' || /^\d+$/.test(value) || /\/(0)$/.test(value))) {
      throw new Error('TRUSTED_PROXY_CIDRS must contain trusted proxy addresses or CIDRs.');
    }
    return proxies.length ? proxies : false;
  }
  return env.RENDER === 'true' ? RENDER_PROXIES : false;
}

export function getClientIp(request: Request): string | undefined {
  const ip = request.ip;
  const trustsProxy = request.app.get('trust proxy fn') as ((address: string, hop: number) => boolean) | undefined;
  // A chain containing only known proxies has no verified client address. Do not
  // accidentally register a shared edge/load-balancer address as an office IP.
  return ip && !trustsProxy?.(ip, 0) ? ip : undefined;
}
