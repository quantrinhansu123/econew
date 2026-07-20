export interface HealthResponse {
  ok: true;
  service: 'eco-transport-api';
  prefix: '/api/v1';
  timestamp: string;
  commit: string | null;
  branch: string | null;
}

type HealthEnvironment = {
  RENDER_GIT_COMMIT?: string;
  RENDER_GIT_BRANCH?: string;
};

export function buildHealthResponse(
  environment: HealthEnvironment = process.env,
  now: () => Date = () => new Date(),
): HealthResponse {
  return {
    ok: true,
    service: 'eco-transport-api',
    prefix: '/api/v1',
    timestamp: now().toISOString(),
    commit: environment.RENDER_GIT_COMMIT?.trim() || null,
    branch: environment.RENDER_GIT_BRANCH?.trim() || null,
  };
}
