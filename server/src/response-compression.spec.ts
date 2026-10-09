import { Controller, Get, Header, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { get } from 'node:http';
import { gunzipSync } from 'node:zlib';
import { createResponseCompression } from './response-compression';

const payload = { items: Array.from({ length: 100 }, (_, index) => ({ id: String(index), waybill_code: `TEST-${index}`, freight_amount: 8115200, note: 'Ghi chú kiểm thử dữ liệu vận đơn' })) };

@Controller('api/v1')
class CompressionFixtureController {
  @Get('inventory') inventory() { return payload; }
  @Get('health') health() { return { ok: true }; }
  @Get('auth/test') auth() { return payload; }
  @Get('untransformed') @Header('Cache-Control', 'no-transform') untransformed() { return payload; }
}
@Module({ controllers: [CompressionFixtureController] })
class CompressionFixtureModule {}

describe('JSON response compression', () => {
  let app: INestApplication;
  let port: number;
  beforeAll(async () => {
    app = await NestFactory.create(CompressionFixtureModule, { logger: false });
    app.use(createResponseCompression());
    await app.listen(0, '127.0.0.1');
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => { await app.close(); });

  const request = (path: string, encoding = 'gzip') => new Promise<{ headers: Record<string, unknown>; body: Buffer }>((resolve, reject) => {
    get({ hostname: '127.0.0.1', port, path: `/api/v1/${path}`, headers: { 'Accept-Encoding': encoding } }, (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({ headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    }).on('error', reject);
  });

  it('reduces wire bytes without altering bill data or money', async () => {
    const response = await request('inventory');
    expect(response.headers['content-encoding']).toBe('gzip');
    expect(String(response.headers.vary)).toContain('Accept-Encoding');
    expect(response.body.length).toBeLessThan(Buffer.byteLength(JSON.stringify(payload)) * 0.3);
    expect(JSON.parse(gunzipSync(response.body).toString())).toEqual(payload);
  });

  it('supports clients that request an uncompressed response', async () => {
    const response = await request('inventory', 'identity');
    expect(response.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(response.body.toString())).toEqual(payload);
  });

  it.each(['health', 'auth/test', 'untransformed'])('leaves %s uncompressed', async (path) => {
    const response = await request(path);
    expect(response.headers['content-encoding']).toBeUndefined();
  });
});
