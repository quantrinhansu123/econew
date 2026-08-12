import { ConfigService } from '@nestjs/config';
import {
  GeminiWaybillRecognitionService,
  normalizeGeminiWaybillCode,
  parseGeminiWaybillCode,
} from './gemini-waybill-recognition.service';

describe('GeminiWaybillRecognitionService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('accepts only a complete ECO waybill code', () => {
    expect(normalizeGeminiWaybillCode(' eco-han-109133 ')).toBe('ECOHAN109133');
    expect(normalizeGeminiWaybillCode('ECOHAN1')).toBe('ECOHAN1');
    expect(normalizeGeminiWaybillCode('0946936999')).toBeNull();
    expect(normalizeGeminiWaybillCode('ECOHAN')).toBeNull();
    expect(normalizeGeminiWaybillCode(null)).toBeNull();
  });

  it('parses structured Gemini output and rejects prose', () => {
    expect(parseGeminiWaybillCode({
      candidates: [{ content: { parts: [{ text: '{"waybill_code":"ECOHAN109066"}' }] } }],
    })).toBe('ECOHAN109066');
    expect(parseGeminiWaybillCode({
      candidates: [{ content: { parts: [{ text: 'Có vẻ là ECOHAN109066' }] } }],
    })).toBeNull();
  });

  it('sends the image through the backend and returns the exact structured code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue('{"candidates":[{"content":{"parts":[{"text":"{\\"waybill_code\\":\\"ECOHAN109084\\"}"}]}}]}'),
    }) as jest.Mock;
    const config = { get: jest.fn((key: string) => key === 'GEMINI_API_KEY' ? 'server-secret' : undefined) } as unknown as ConfigService;
    const service = new GeminiWaybillRecognitionService(config);
    const file = {
      buffer: Buffer.from('image'),
      size: 5,
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    await expect(service.recognize(file)).resolves.toEqual({ waybill_code: 'ECOHAN109084', provider: 'GEMINI' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('gemini-3.6-flash:generateContent'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-goog-api-key': 'server-secret' }),
      }),
    );
  });
});
