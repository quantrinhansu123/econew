/** Mã bill theo bưu cục: ECO-HAN-1, ECO-HCM-2, … */
export const ECO_BILL_CODE_PATTERN = /^ECO-([A-Z0-9]+)-(\d+)$/i;

export function normalizeHubCode(hubCode?: string | null): string {
  return String(hubCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatEcoBillCode(hubCode: string, sequence: number): string {
  const normalizedHubCode = normalizeHubCode(hubCode) || 'HUB';
  return `ECO-${normalizedHubCode}-${Math.max(1, Math.floor(sequence))}`;
}

export function maxEcoBillSequence(codes: string[], hubCode: string): number {
  const normalizedHubCode = normalizeHubCode(hubCode);
  return codes.reduce((max, code) => {
    const match = code.trim().match(ECO_BILL_CODE_PATTERN);
    return match && match[1].toUpperCase() === normalizedHubCode ? Math.max(max, Number(match[2])) : max;
  }, 0);
}

export function nextEcoBillCodeFromCodes(codes: string[], hubCode: string): string {
  return formatEcoBillCode(hubCode, maxEcoBillSequence(codes, hubCode) + 1);
}
