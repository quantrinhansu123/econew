import { ApiError } from '../../../lib/api';
import type { NewOrderFormState } from './orderFormTypes';
import type { CreatedWaybill } from './types';
import { buildBulkCreatePayload } from './orderBulkExcelUtils';

const DEFAULT_MAX_CODE_ATTEMPTS = 5;

type CreateBulkWaybillOptions = {
  form: NewOrderFormState;
  autoAssignedWaybillCode: boolean;
  getNextWaybillCode: (originHubId: string) => Promise<string>;
  createWaybill: (payload: ReturnType<typeof buildBulkCreatePayload>) => Promise<CreatedWaybill>;
  maxCodeAttempts?: number;
};

export function isDuplicateWaybillCodeError(error: unknown) {
  return error instanceof ApiError
    && error.status === 409
    && /waybill code already exists/i.test(error.message);
}

/**
 * Mã tự cấp luôn được lấy lại ngay trước khi POST. Nếu người khác vừa dùng
 * mất mã đó, lấy mã mới và thử lại; mã người dùng nhập tay không bị đổi.
 */
export async function createBulkWaybillWithFreshCode({
  form,
  autoAssignedWaybillCode,
  getNextWaybillCode,
  createWaybill,
  maxCodeAttempts = DEFAULT_MAX_CODE_ATTEMPTS,
}: CreateBulkWaybillOptions) {
  const attempts = autoAssignedWaybillCode ? Math.max(1, maxCodeAttempts) : 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const nextCode = autoAssignedWaybillCode
      ? (await getNextWaybillCode(form.originHubId)).trim().toUpperCase()
      : form.soBill.trim().toUpperCase();
    if (!nextCode) throw new Error('Không lấy được số bill mới từ hệ thống. Vui lòng thử lại.');

    const resolvedForm = { ...form, soBill: nextCode };
    try {
      const response = await createWaybill(buildBulkCreatePayload(resolvedForm));
      return { response, form: resolvedForm };
    } catch (error) {
      const canRetry = autoAssignedWaybillCode
        && isDuplicateWaybillCodeError(error)
        && attempt < attempts - 1;
      if (canRetry) continue;
      if (autoAssignedWaybillCode && isDuplicateWaybillCodeError(error)) {
        throw new Error('Hệ thống chưa cấp được số bill mới. Vui lòng bấm Nhập lại.');
      }
      throw error;
    }
  }

  throw new Error('Không thể tạo đơn.');
}
