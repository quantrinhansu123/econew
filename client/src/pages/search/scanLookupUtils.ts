export type ScannedLookupValue =
  | { kind: 'MANIFEST_ID'; value: string }
  | { kind: 'CODE'; value: string };

const cleanCode = (value: string) => value.trim();

export const parseScannedLookupValue = (input: string): ScannedLookupValue | null => {
  const raw = cleanCode(input);
  if (!raw) return null;

  try {
    const url = new URL(raw, 'https://local.eco.invalid');
    const manifestMatch = url.pathname.match(/^\/warehouse\/manifests\/(\d+)\/?$/i);
    if (manifestMatch) return { kind: 'MANIFEST_ID', value: manifestMatch[1] };

    const embeddedCode = url.searchParams.get('waybill_code')
      || url.searchParams.get('manifest_code')
      || url.searchParams.get('code');
    if (embeddedCode?.trim()) return { kind: 'CODE', value: embeddedCode.trim() };
  } catch {
    // Mã barcode thông thường không phải URL; giữ nguyên để tra cứu chính xác.
  }

  return { kind: 'CODE', value: raw };
};

export const findExactManifestMatch = <T extends { manifest_code?: string | null }>(items: T[], code: string): T | null => {
  const normalized = cleanCode(code).toUpperCase();
  return items.find((item) => cleanCode(item.manifest_code || '').toUpperCase() === normalized) ?? null;
};
