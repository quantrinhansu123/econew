declare const __ECO_DEV_API_PORT__: number;

export const DEV_API_PORT = (() => {
  const fromEnv = Number(import.meta.env.VITE_DEV_API_PORT);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  if (typeof __ECO_DEV_API_PORT__ !== 'undefined' && Number.isFinite(__ECO_DEV_API_PORT__) && __ECO_DEV_API_PORT__ > 0) {
    return __ECO_DEV_API_PORT__;
  }
  return 3002;
})();

export const DEV_API_ORIGIN = `http://127.0.0.1:${DEV_API_PORT}`;

/** Base URL cho mọi request API (dev proxy hoặc production). */
export function resolveApiBaseUrl(): string {
  if (import.meta.env.DEV && import.meta.env.VITE_API_URL_DIRECT !== 'true') {
    return '/api/v1';
  }

  const fromEnv = import.meta.env.VITE_API_URL?.trim();
  if (fromEnv) {
    const fixedHost = fromEnv.replace(/\/\/localhost\b/i, '//127.0.0.1');
    const base = fixedHost.replace(/\/$/, '');
    return base.endsWith('/api/v1') ? base : `${base}/api/v1`;
  }

  if (import.meta.env.DEV) return '/api/v1';

  // Production: không bao giờ gọi localhost từ trình duyệt — dùng cùng origin (/api/v1 qua Vercel rewrite).
  if (typeof window !== 'undefined' && window.location.origin) {
    return `${window.location.origin}/api/v1`;
  }

  return '/api/v1';
}

export function connectionErrorMessage(): string {
  if (import.meta.env.DEV) {
    return (
      `Không kết nối được server. Chạy \`cd server && npm run dev\`, ` +
      `đợi dòng "API listening on http://127.0.0.1:${DEV_API_PORT}/..." rồi refresh (Ctrl+F5).`
    );
  }
  return 'Không kết nối được server. API backend có thể chưa sẵn sàng — thử refresh sau vài giây hoặc liên hệ quản trị.';
}
