/** Mã bill mới viết liền theo bưu cục: ECOHAN1, ECOHCM2, … */
export const ECO_BILL_CODE_PATTERN = /^ECO([A-Z]+)(\d+)$/i;

export function normalizeHubCode(hubCode?: string | null): string {
  return String(hubCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatEcoBillCode(hubCode: string, sequence: number): string {
  const normalizedHubCode = normalizeHubCode(hubCode) || 'HUB';
  return `ECO${normalizedHubCode}${Math.max(1, Math.floor(sequence))}`;
}

export function maxEcoBillSequence(codes: string[], hubCode: string): number {
  const normalizedHubCode = normalizeHubCode(hubCode);
  const prefix = `ECO${normalizedHubCode}`;
  return codes.reduce((max, code) => {
    const normalizedCode = code.trim().toUpperCase().replace(/[-\s]+/g, '');
    const suffix = normalizedCode.startsWith(prefix) ? normalizedCode.slice(prefix.length) : '';
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
}

export function nextEcoBillCodeFromCodes(codes: string[], hubCode: string): string {
  return formatEcoBillCode(hubCode, maxEcoBillSequence(codes, hubCode) + 1);
}
