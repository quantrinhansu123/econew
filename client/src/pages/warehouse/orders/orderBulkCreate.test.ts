import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../lib/api';
import { sampleOrderForm } from './orderFormData';
import { createBulkWaybillWithFreshCode } from './orderBulkCreate';
import type { CreatedWaybill } from './types';

const bulkForm = () => ({
  ...sampleOrderForm(),
  originHubId: '1',
  destHubId: '2',
  soBill: 'ECOHAN108969',
});

describe('bulk waybill creation', () => {
  it('refreshes an automatically assigned code immediately before creating', async () => {
    const getNextWaybillCode = vi.fn().mockResolvedValue('ECOHAN108971');
    const createWaybill = vi.fn().mockResolvedValue({
      id: '1',
      waybill_code: 'ECOHAN108971',
    } as CreatedWaybill);

    const created = await createBulkWaybillWithFreshCode({
      form: bulkForm(),
      autoAssignedWaybillCode: true,
      getNextWaybillCode,
      createWaybill,
    });

    expect(getNextWaybillCode).toHaveBeenCalledWith('1');
    expect(createWaybill).toHaveBeenCalledWith(
      expect.objectContaining({ waybill_code: 'ECOHAN108971' }),
    );
    expect(created.form.soBill).toBe('ECOHAN108971');
  });

  it('keeps the past sent date from the Excel row in the create payload', async () => {
    const createWaybill = vi.fn().mockResolvedValue({
      id: '1',
      waybill_code: 'ECOHAN108969',
    } as CreatedWaybill);

    await createBulkWaybillWithFreshCode({
      form: { ...bulkForm(), ngayDi: '2026-07-31' },
      autoAssignedWaybillCode: false,
      getNextWaybillCode: vi.fn(),
      createWaybill,
    });

    expect(createWaybill).toHaveBeenCalledWith(expect.objectContaining({
      sent_date: '2026-07-31',
      note: expect.stringContaining('ngay_gui=2026-07-31'),
    }));
  });

  it('gets another fresh code and retries after a duplicate race', async () => {
    const getNextWaybillCode = vi.fn()
      .mockResolvedValueOnce('ECOHAN108971')
      .mockResolvedValueOnce('ECOHAN108972');
    const createWaybill = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'Waybill code already exists', null))
      .mockResolvedValueOnce({
        id: '2',
        waybill_code: 'ECOHAN108972',
      } as CreatedWaybill);

    const created = await createBulkWaybillWithFreshCode({
      form: bulkForm(),
      autoAssignedWaybillCode: true,
      getNextWaybillCode,
      createWaybill,
    });

    expect(getNextWaybillCode).toHaveBeenCalledTimes(2);
    expect(createWaybill).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ waybill_code: 'ECOHAN108971' }),
    );
    expect(createWaybill).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ waybill_code: 'ECOHAN108972' }),
    );
    expect(created.form.soBill).toBe('ECOHAN108972');
  });

  it('preserves a bill code entered explicitly in Excel', async () => {
    const getNextWaybillCode = vi.fn();
    const createWaybill = vi.fn().mockResolvedValue({
      id: '3',
      waybill_code: 'ECOHAN500',
    } as CreatedWaybill);

    await createBulkWaybillWithFreshCode({
      form: { ...bulkForm(), soBill: 'ECOHAN500' },
      autoAssignedWaybillCode: false,
      getNextWaybillCode,
      createWaybill,
    });

    expect(getNextWaybillCode).not.toHaveBeenCalled();
    expect(createWaybill).toHaveBeenCalledWith(
      expect.objectContaining({ waybill_code: 'ECOHAN500' }),
    );
  });
});
