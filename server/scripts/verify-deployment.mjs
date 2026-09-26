import { execFileSync } from 'node:child_process';

// Read-only: compare the running backend with the revision being released.
const expected = process.argv[2] || execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  cwd: new URL('..', import.meta.url),
}).trim();
const healthUrl = process.argv[3] || 'https://econew.onrender.com/api/v1/health';

try {
  const response = await fetch(healthUrl, {
    headers: { 'Cache-Control': 'no-cache' },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`Health endpoint returned HTTP ${response.status}`);
  const health = await response.json();
  console.log(`Expected commit: ${expected}`);
  console.log(`Running commit:  ${health.commit || 'unknown'}`);
  console.log(`Running branch:  ${health.branch || 'unknown'}`);
  if (health.ok !== true || health.service !== 'eco-transport-api') {
    throw new Error('Backend health check failed');
  }
  if (!/^[a-f0-9]{40}$/i.test(expected) || health.commit !== expected) {
    throw new Error('Backend revision does not match. Deploy this commit on Render; Vercel success only confirms the frontend deployment.');
  }
  console.log('Backend deployment verified.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
