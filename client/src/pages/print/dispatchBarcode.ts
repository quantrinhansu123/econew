export function buildDispatchBarcodeUrl(value: string) {
  const code = value.trim();
  if (!code) return '';
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=3&height=10&includetext=false`;
}

export function buildManifestScanPath(manifestId: string | number) {
  return `/warehouse/manifests/${encodeURIComponent(String(manifestId))}`;
}

export function buildManifestScanUrl(manifestId: string | number, origin?: string) {
  const path = buildManifestScanPath(manifestId);
  const base = String(origin || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function buildQrCodeUrl(value: string) {
  const content = value.trim();
  if (!content) return '';
  return `https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(content)}&scale=4&eclevel=M`;
}
