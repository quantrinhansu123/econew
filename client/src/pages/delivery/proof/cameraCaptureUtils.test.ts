import { describe, expect, it } from 'vitest';
import { cameraFailureMessage, createCameraCaptureFile } from './cameraCaptureUtils';

describe('cameraCaptureUtils', () => {
  it('tạo đúng File JPEG để đưa thẳng vào quy trình báo phát', () => {
    const capturedAt = Date.parse('2026-08-11T14:00:01.123Z');
    const file = createCameraCaptureFile(new Blob(['image'], { type: 'image/jpeg' }), capturedAt);

    expect(file.name).toBe('bao-phat-2026-08-11T14-00-01-123Z.jpg');
    expect(file.type).toBe('image/jpeg');
    expect(file.lastModified).toBe(capturedAt);
  });

  it('giải thích rõ khi người dùng chưa cấp quyền camera', () => {
    expect(cameraFailureMessage(new DOMException('Denied', 'NotAllowedError'))).toContain('cấp quyền camera');
  });
});
