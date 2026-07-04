const DEV_CORS_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:6060',
  'http://127.0.0.1:6060',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

/** Production + preview frontends — always allowed alongside CORS_ORIGIN env. */
const BUILTIN_CORS_ORIGINS = [
  'https://eco-webapp.vercel.app',
  'https://eco-webapp-htung0403.vercel.app',
  'https://econew-six.vercel.app',
];

/** Mọi preview/production deploy trên Vercel (*.vercel.app). */
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[\w-]+\.vercel\.app$/i;
const RENDER_ORIGIN = /^https:\/\/[\w-]+\.onrender\.com$/i;

export function isAllowedCorsOrigin(origin?: string | null): boolean {
  if (!origin) return true;
  const allowed = resolveCorsOriginList();
  if (allowed.includes(origin)) return true;
  if (VERCEL_PREVIEW_ORIGIN.test(origin)) return true;
  return RENDER_ORIGIN.test(origin);
}

export function resolveCorsOriginList(): string[] {
  const fromEnv = process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) ?? [];
  return [...new Set([...DEV_CORS_ORIGINS, ...BUILTIN_CORS_ORIGINS, ...fromEnv])];
}

export function corsOriginDelegate(
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
) {
  if (!origin || isAllowedCorsOrigin(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`CORS blocked origin: ${origin}`));
}
