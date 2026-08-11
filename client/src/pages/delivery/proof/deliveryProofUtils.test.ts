import { describe, expect, it } from 'vitest';
import { isExactWaybillNotFoundError, normalizeDetectedWaybillCode, proofResultLabel } from './deliveryProofUtils';

describe('deliveryProofUtils', () => {
  it('normalizes direct waybill barcodes without guessing another bill', () => {
    expect(normalizeDetectedWaybillCode(' eco-han-001 ')).toBe('ECO-HAN-001');
    expect(normalizeDetectedWaybillCode('ECOHCM109157')).toBe('ECOHCM109157');
  });

  it('accepts a waybill code carried in a QR URL and rejects unrelated content', () => {
    expect(normalizeDetectedWaybillCode('https://eco.example/waybills/ECOHAN109157')).toBe('ECOHAN109157');
    expect(normalizeDetectedWaybillCode('https://eco.example/policy')).toBeNull();
    expect(normalizeDetectedWaybillCode('HELLO WORLD')).toBeNull();
  });

  it('has explicit operator-facing results', () => {
    expect(proofResultLabel('SUCCESS')).toBe('Báo phát thành công');
    expect(proofResultLabel('NOT_FOUND')).toBe('Mã không tồn tại');
    expect(proofResultLabel('ALREADY_DELIVERED')).toBe('Đã báo phát trước đó');
  });

  it('does not misreport a missing backend route as a missing waybill', () => {
    expect(isExactWaybillNotFoundError({
      status: 404,
      message: 'Cannot GET /api/v1/waybills/proof-of-delivery/resolve',
      payload: { message: 'Cannot GET /api/v1/waybills/proof-of-delivery/resolve' },
    })).toBe(false);
    expect(isExactWaybillNotFoundError({
      status: 404,
      message: 'Waybill not found',
      payload: { message: 'Waybill not found' },
    })).toBe(true);
  });
});
