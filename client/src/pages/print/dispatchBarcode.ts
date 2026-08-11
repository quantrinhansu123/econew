export function buildDispatchBarcodeUrl(value: string) {
  const code = value.trim();
  if (!code) return '';
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=3&height=10&includetext=false`;
}
