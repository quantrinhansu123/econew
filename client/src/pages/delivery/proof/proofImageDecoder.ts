import { normalizeDetectedWaybillCode } from './deliveryProofUtils';

export type ProofImageRotation = 0 | 90 | 180 | 270;
export type ProofImageRegion = 'TOP_RIGHT' | 'BARCODE_STRIP';

export const PROOF_IMAGE_ROTATIONS: ProofImageRotation[] = [0, 90, 270, 180];
export const PROOF_IMAGE_REGIONS: ProofImageRegion[] = ['BARCODE_STRIP', 'TOP_RIGHT'];
export const PROOF_ZXING_BUDGET_MS = 900;

const MAX_IMAGE_SIDE = 2400;
const MAX_CROP_SIDE = 1800;

type BarcodeReader = {
  possibleFormats: number[];
  setHints(hints: Map<number, unknown>): void;
  decodeFromImageElement(source: HTMLImageElement): Promise<{ getText(): string }>;
  decodeFromCanvas(source: HTMLCanvasElement): { getText(): string };
};

const loadImage = async (url: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  if (image.complete && image.naturalWidth > 0) return image;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('IMAGE_LOAD_FAILED'));
  });
  return image;
};

const renderRotatedImage = (image: HTMLImageElement, rotation: ProofImageRotation, deskewAngle = 0) => {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(sourceWidth, sourceHeight));
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale));
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale));
  const swapsAxes = rotation === 90 || rotation === 270;
  const baseWidth = swapsAxes ? drawHeight : drawWidth;
  const baseHeight = swapsAxes ? drawWidth : drawHeight;
  const deskewRadians = (deskewAngle * Math.PI) / 180;
  const canvas = document.createElement('canvas');
  canvas.width = deskewAngle === 0
    ? baseWidth
    : Math.ceil(Math.abs(baseWidth * Math.cos(deskewRadians)) + Math.abs(baseHeight * Math.sin(deskewRadians)));
  canvas.height = deskewAngle === 0
    ? baseHeight
    : Math.ceil(Math.abs(baseWidth * Math.sin(deskewRadians)) + Math.abs(baseHeight * Math.cos(deskewRadians)));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.fillStyle = '#ffffff';
  context.fillRect(-canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  context.rotate(((rotation + deskewAngle) * Math.PI) / 180);
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  return canvas;
};

const cropRegion = (source: HTMLCanvasElement, region: ProofImageRegion) => {
  const normalized = region === 'TOP_RIGHT'
    ? { x: 0.32, y: 0, width: 0.68, height: 0.46 }
    : { x: 0.48, y: 0, width: 0.52, height: 0.31 };
  const sourceX = Math.round(source.width * normalized.x);
  const sourceY = Math.round(source.height * normalized.y);
  const sourceWidth = Math.max(1, Math.round(source.width * normalized.width));
  const sourceHeight = Math.max(1, Math.round(source.height * normalized.height));
  const upscale = Math.min(2, MAX_CROP_SIDE / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * upscale));
  canvas.height = Math.max(1, Math.round(sourceHeight * upscale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
};

const increaseBarcodeContrast = (source: HTMLCanvasElement) => {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('CANVAS_CONTEXT_UNAVAILABLE');
  context.drawImage(source, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = (pixels[index] * 0.299) + (pixels[index + 1] * 0.587) + (pixels[index + 2] * 0.114);
    const contrasted = Math.max(0, Math.min(255, ((luminance - 128) * 1.85) + 128));
    pixels[index] = contrasted;
    pixels[index + 1] = contrasted;
    pixels[index + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
};

const decodeImageElement = async (reader: BarcodeReader, image: HTMLImageElement) => {
  try {
    return normalizeDetectedWaybillCode((await reader.decodeFromImageElement(image)).getText());
  } catch {
    return null;
  }
};

const decodeCanvas = (reader: BarcodeReader, canvas: HTMLCanvasElement) => {
  try {
    return normalizeDetectedWaybillCode(reader.decodeFromCanvas(canvas).getText());
  } catch {
    return null;
  }
};

const yieldToBrowser = () => new Promise<void>(resolve => globalThis.setTimeout(resolve, 0));
const now = () => globalThis.performance?.now?.() ?? Date.now();

async function decodeWithFormat(
  reader: BarcodeReader,
  image: HTMLImageElement,
  format: number,
  enhance: boolean,
  deadline: number,
): Promise<string | null> {
  reader.possibleFormats = [format];
  const direct = await decodeImageElement(reader, image);
  if (direct) return direct;

  for (const rotation of PROOF_IMAGE_ROTATIONS) {
    if (now() >= deadline) return null;
    const rotated = renderRotatedImage(image, rotation);
    for (const region of PROOF_IMAGE_REGIONS) {
      if (now() >= deadline) {
        rotated.width = 1;
        rotated.height = 1;
        return null;
      }
      const cropped = cropRegion(rotated, region);
      const detected = decodeCanvas(reader, cropped);
      if (detected) return detected;
      if (enhance) {
        const contrasted = increaseBarcodeContrast(cropped);
        const enhancedDetected = decodeCanvas(reader, contrasted);
        contrasted.width = 1;
        contrasted.height = 1;
        if (enhancedDetected) return enhancedDetected;
      }
      cropped.width = 1;
      cropped.height = 1;
    }
    rotated.width = 1;
    rotated.height = 1;
    await yieldToBrowser();
  }
  return null;
}

/**
 * Runs a short Code128 pass over the ECO label header. Difficult photos fall back
 * to server-side Gemini instead of blocking the phone with exhaustive ZXing work.
 */
export async function decodeWaybillCodeFromProofImage(imageUrl: string): Promise<string | null> {
  const image = await loadImage(imageUrl);
  const { BarcodeFormat, BrowserMultiFormatReader } = await import('@zxing/browser');
  const { DecodeHintType } = await import('@zxing/library');
  const reader = new BrowserMultiFormatReader() as unknown as BarcodeReader;
  reader.setHints(new Map([[DecodeHintType.TRY_HARDER, true]]));
  return decodeWithFormat(
    reader,
    image,
    BarcodeFormat.CODE_128,
    true,
    now() + PROOF_ZXING_BUDGET_MS,
  );
}
