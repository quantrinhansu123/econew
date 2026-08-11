export function normalizeDetectedWaybillCode(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw.length > 500) return null;

  let candidate = raw;
  try {
    const url = new URL(raw);
    candidate = url.searchParams.get('waybill_code')
      || url.searchParams.get('code')
      || url.pathname.split('/').filter(Boolean).at(-1)
      || '';
  } catch {
    // Barcode vận đơn thường chứa trực tiếp mã thay vì URL.
  }

  const normalized = candidate.trim().toUpperCase();
  if (normalized.length < 4 || normalized.length > 64) return null;
  if (!/^[A-Z0-9-]+$/.test(normalized) || !/[A-Z]/.test(normalized) || !/[0-9]/.test(normalized)) return null;
  return normalized;
}

export function proofResultLabel(status: string): string {
  switch (status) {
    case 'SUCCESS': return 'Báo phát thành công';
    case 'UNREADABLE': return 'Không nhận diện được mã';
    case 'NOT_FOUND': return 'Mã không tồn tại';
    case 'ALREADY_DELIVERED': return 'Đã báo phát trước đó';
    case 'PROCESSING': return 'Đang nhận diện và lưu';
    default: return 'Có lỗi, chưa cập nhật vận đơn';
  }
}
