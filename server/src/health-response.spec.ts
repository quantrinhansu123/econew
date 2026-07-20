import { buildHealthResponse } from './health-response';

describe('buildHealthResponse', () => {
  const now = () => new Date('2026-07-20T12:34:56.000Z');

  it('includes the Render revision when deployment metadata is available', () => {
    expect(
      buildHealthResponse(
        {
          RENDER_GIT_COMMIT: '675467f123456789',
          RENDER_GIT_BRANCH: 'main',
        },
        now,
      ),
    ).toEqual({
      ok: true,
      service: 'eco-transport-api',
      prefix: '/api/v1',
      timestamp: '2026-07-20T12:34:56.000Z',
      commit: '675467f123456789',
      branch: 'main',
    });
  });

  it('returns null deployment metadata outside Render', () => {
    expect(buildHealthResponse({}, now)).toMatchObject({
      ok: true,
      service: 'eco-transport-api',
      prefix: '/api/v1',
      commit: null,
      branch: null,
    });
  });

  it('treats blank deployment metadata as unavailable', () => {
    expect(
      buildHealthResponse(
        {
          RENDER_GIT_COMMIT: '  ',
          RENDER_GIT_BRANCH: '',
        },
        now,
      ),
    ).toMatchObject({ commit: null, branch: null });
  });
});
