import { ExecutionContext, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AddressInfo } from 'node:net';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { getTrustProxyConfig } from '../proxy.config';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

describe('attendance HTTP and proxy boundary', () => {
  let app: NestExpressApplication;
  let baseUrl: string;
  const service = {
    getNetworkStatus: jest.fn((ip?: string) => ({ ip: ip ?? null })),
    checkAttendance: jest.fn(async () => ({ success: true })),
    createLocation: jest.fn(async () => ({ id: '1' })),
  };
  const headers = { authorization: 'test', 'content-type': 'application/json' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: service }, RolesGuard],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();
        if (request.headers.authorization !== 'test') throw new UnauthorizedException();
        request.user = { id: '1', role_mask: Number(request.headers['x-test-role'] ?? '4') };
        return true;
      },
    }).compile();
    app = module.createNestApplication<NestExpressApplication>();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/attendance`;
  });

  afterAll(async () => { await app?.close(); });
  beforeEach(() => { jest.clearAllMocks(); app.set('trust proxy', false); });

  it('requires authentication and disables caching of network status', async () => {
    expect((await fetch(`${baseUrl}/network`)).status).toBe(401);
    const response = await fetch(`${baseUrl}/network`, { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('ignores forwarded headers on a direct connection', async () => {
    const response = await fetch(`${baseUrl}/network`, { headers: { ...headers, 'x-forwarded-for': '8.8.8.8' } });
    expect(await response.json()).toEqual({ ip: '127.0.0.1' });
  });

  it('walks trusted Render proxies from right to left and ignores the forged first IP', async () => {
    app.set('trust proxy', getTrustProxyConfig({ RENDER: 'true' }));
    const response = await fetch(`${baseUrl}/network`, { headers: { ...headers, 'x-forwarded-for': '8.8.8.8, 1.1.1.1, 172.64.1.1, 10.0.0.1' } });
    expect(await response.json()).toEqual({ ip: '1.1.1.1' });
  });

  it('does not report a proxy as the office IP when the client address is missing', async () => {
    app.set('trust proxy', getTrustProxyConfig({ RENDER: 'true' }));
    const response = await fetch(`${baseUrl}/network`, { headers: { ...headers, 'x-forwarded-for': '172.64.1.1, 10.0.0.1' } });
    expect(await response.json()).toEqual({ ip: null });
  });

  it('rejects IP supplied in JSON and accepts IP-only check-in DTOs', async () => {
    const forged = await fetch(`${baseUrl}/check`, { method: 'POST', headers, body: JSON.stringify({ type: 'check_in', source_ip: '8.8.8.8' }) });
    expect(forged.status).toBe(400);
    expect(service.checkAttendance).not.toHaveBeenCalled();
    const response = await fetch(`${baseUrl}/check`, { method: 'POST', headers, body: JSON.stringify({ type: 'check_in' }) });
    expect(response.status).toBe(201);
    expect(service.checkAttendance).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }), expect.objectContaining({ type: 'check_in' }), expect.any(String), '127.0.0.1');
  });

  it('allows only managers and directors to register or change office networks', async () => {
    const body = JSON.stringify({ name: 'HAN', verification_method: 'ip', allowed_ips: ['8.8.8.8'] });
    for (const role of ['4', '16']) {
      const response = await fetch(`${baseUrl}/locations`, { method: 'POST', headers: { ...headers, 'x-test-role': role }, body });
      expect(response.status).toBe(403);
    }
    expect(service.createLocation).not.toHaveBeenCalled();
    for (const role of ['32', '64']) {
      const response = await fetch(`${baseUrl}/locations`, { method: 'POST', headers: { ...headers, 'x-test-role': role }, body });
      expect(response.status).toBe(201);
    }
  });

  it('keeps coordinate and action validation on the HTTP boundary', async () => {
    for (const body of [{ type: 'fake' }, { type: 'check_in', latitude: 100 }, { type: 'check_in', accuracy: -1 }]) {
      const response = await fetch(`${baseUrl}/check`, { method: 'POST', headers, body: JSON.stringify(body) });
      expect(response.status).toBe(400);
    }
    expect(service.checkAttendance).not.toHaveBeenCalled();
  });
});
