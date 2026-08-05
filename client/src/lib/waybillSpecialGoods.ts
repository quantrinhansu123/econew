export const WAYBILL_SPECIAL_GOODS_OPTIONS = [
  { value: 'RETURN_DOCUMENTS', label: 'Hoàn chứng từ gốc đi kèm' },
  { value: 'HIGH_VALUE', label: 'Giá trị cao' },
  { value: 'OVERSIZED', label: 'Quá khổ' },
  { value: 'FRAGILE', label: 'Dễ vỡ' },
  { value: 'MAGNETIC_BATTERY', label: 'Từ tính, Pin' },
  { value: 'LIQUID', label: 'Chất lỏng' },
] as const;

export type WaybillSpecialGoodsCode = (typeof WAYBILL_SPECIAL_GOODS_OPTIONS)[number]['value'];

const SPECIAL_GOODS_VALUES = new Set<string>(WAYBILL_SPECIAL_GOODS_OPTIONS.map((option) => option.value));

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseNoteField(note: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = note.match(new RegExp(`(?:^|\\|)\\s*${escapedKey}=([^|]*)`, 'i'));
  return match?.[1]?.trim() || '';
}

export function normalizeWaybillSpecialGoods(value: unknown): WaybillSpecialGoodsCode[] {
  const rawValues = Array.isArray(value)
    ? value
    : safeDecode(String(value ?? '')).split(',');
  return [...new Set(rawValues
    .map((item) => String(item).trim().toUpperCase())
    .filter((item): item is WaybillSpecialGoodsCode => SPECIAL_GOODS_VALUES.has(item)))];
}

export function serializeWaybillSpecialGoods(value: unknown): string {
  return normalizeWaybillSpecialGoods(value).join(',');
}

export function specialGoodsFromWaybillNote(note: string | null | undefined): WaybillSpecialGoodsCode[] {
  return normalizeWaybillSpecialGoods(parseNoteField(String(note || ''), 'special_goods'));
}

export function specialGoodsLabels(value: unknown): string[] {
  const selected = new Set(normalizeWaybillSpecialGoods(value));
  return WAYBILL_SPECIAL_GOODS_OPTIONS
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
}

export function formatSpecialGoodsNote(value: unknown): string {
  const labels = specialGoodsLabels(value);
  return labels.join(', ');
}

export function userNoteFromWaybillNote(note: string | null | undefined): string {
  const source = String(note || '');
  const encoded = parseNoteField(source, 'user_note');
  if (encoded) return safeDecode(encoded);
  return source
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && !/^[a-z][a-z0-9_]*\s*=/i.test(part))
    .join(' | ');
}

export function resolveWaybillDisplayNote(note: string | null | undefined): string {
  return [
    userNoteFromWaybillNote(note),
    formatSpecialGoodsNote(specialGoodsFromWaybillNote(note)),
  ].filter(Boolean).join(' · ');
}
