import { ApiError, refreshAccessToken } from './api';
import { resolveApiBaseUrl } from './apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = 'eco_access_token';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_PRICE_LIST_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2_000;
const MAX_RECOGNITION_IMAGE_EDGE = 1_280;
const OPTIMIZE_THRESHOLD_BYTES = 1_500_000;
const UPLOAD_TIMEOUT_MS = 55_000;
const SERVER_SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export const IMAGE_UPLOAD_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'image/avif',
].join(',');

export const CUSTOMER_PRICE_LIST_ACCEPT = [
  '.pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
].join(',');

const getStoredAccessToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY) || sessionStorage.getItem(ACCESS_TOKEN_KEY);
};

const getErrorMessage = (payload: unknown, fallback: string) => {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const message = (payload as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message.trim()) return message;
  }
  return fallback;
};

type ImageOptimizationOptions = {
  forceTransform?: boolean;
  jpegQuality?: number;
  maxEdge?: number;
};

async function optimizeMobilePhoto(file: File, options: ImageOptimizationOptions = {}): Promise<File> {
  const {
    forceTransform = false,
    jpegQuality = 0.82,
    maxEdge = MAX_IMAGE_EDGE,
  } = options;
  const mimeType = file.type.toLowerCase();
  const serverSupportsOriginal = SERVER_SUPPORTED_IMAGE_TYPES.has(mimeType);
  if (
    !forceTransform &&
    serverSupportsOriginal
    && (mimeType === 'image/gif' || file.size <= OPTIMIZE_THRESHOLD_BYTES)
  ) {
    return file;
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    if (!serverSupportsOriginal) {
      throw new ApiError(
        400,
        'Trình duyệt không đọc được định dạng ảnh này để chuyển sang JPEG. Vui lòng chọn ảnh JPEG, PNG hoặc WebP.',
        null,
      );
    }
    return file;
  }

  try {
    const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) {
      if (!serverSupportsOriginal) {
        throw new ApiError(
          400,
          'Trình duyệt không thể chuyển định dạng ảnh này sang JPEG. Vui lòng chọn ảnh JPEG, PNG hoặc WebP.',
          null,
        );
      }
      return file;
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', jpegQuality);
    });
    if (!blob) {
      if (!serverSupportsOriginal) {
        throw new ApiError(
          400,
          'Không chuyển được định dạng ảnh này sang JPEG. Vui lòng chọn ảnh JPEG, PNG hoặc WebP.',
          null,
        );
      }
      return file;
    }
    if (!forceTransform && serverSupportsOriginal && blob.size >= file.size && file.size <= MAX_UPLOAD_BYTES) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'anh-bill';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

const readUploadPayload = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text.slice(0, 280) };
  }
};

const sendUploadAttempt = async (
  file: File,
  endpoint: string,
  token: string | null,
): Promise<{ response: Response; payload: unknown }> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
      signal: controller.signal,
    });
    const payload = await readUploadPayload(response);
    return { response, payload };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        408,
        'Upload tệp quá thời gian chờ 55 giây. Vui lòng kiểm tra mạng và thử lại.',
        null,
      );
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, 'Không kết nối được server để upload tệp.', null);
  } finally {
    clearTimeout(timeout);
  }
};

const refreshTokenForUpload = async () => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new ApiError(
        408,
        'Làm mới phiên đăng nhập quá thời gian chờ. Vui lòng đăng nhập lại rồi thử upload ảnh.',
        null,
      ));
    }, UPLOAD_TIMEOUT_MS);
  });

  try {
    return await Promise.race([refreshAccessToken(), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

async function uploadStoredFile(file: File, endpoint: string, fallbackError: string): Promise<string> {
  let attempt = await sendUploadAttempt(file, endpoint, getStoredAccessToken());
  if (attempt.response.status === 401) {
    const refreshed = await refreshTokenForUpload();
    if (refreshed.token) {
      attempt = await sendUploadAttempt(file, endpoint, refreshed.token);
    }
  }

  const { response, payload } = attempt;
  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError(
        401,
        'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại rồi thử upload.',
        payload,
      );
    }
    throw new ApiError(response.status, getErrorMessage(payload, fallbackError), payload);
  }

  const url = payload && typeof payload === 'object' && 'url' in payload
    ? String((payload as { url: unknown }).url)
    : '';
  if (!url.trim()) {
    throw new ApiError(502, 'Server không trả về URL tệp.', payload);
  }
  return url.trim();
}

async function uploadImage(file: File, endpoint: string): Promise<string> {
  validateImageSource(file);

  const uploadFile = await optimizeMobilePhoto(file);
  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'Không thể nén ảnh xuống dưới 5 MB. Vui lòng chọn ảnh nhỏ hơn.', null);
  }

  return uploadStoredFile(uploadFile, endpoint, 'Không upload được ảnh.');
}

function validateImageSource(file: File) {
  const hasImageMime = file.type.toLowerCase().startsWith('image/');
  const hasKnownImageExtension = /\.(?:avif|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
  if (!hasImageMime && !hasKnownImageExtension) {
    throw new ApiError(400, 'Chỉ chấp nhận file ảnh.', null);
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new ApiError(400, 'Ảnh gốc tối đa 20 MB.', null);
  }
}

export function uploadPaymentProof(file: File): Promise<string> {
  return uploadImage(file, '/uploads/payment-proofs');
}

export function uploadExpenseReceipt(file: File): Promise<string> {
  return uploadImage(file, '/uploads/expense-receipts');
}

export function uploadWaybillImage(file: File): Promise<string> {
  return uploadImage(file, '/uploads/waybill-images');
}

export function uploadWaybillDimensionFile(file: File): Promise<string> {
  if (!/\.(?:xlsx|xls)$/i.test(file.name)) throw new ApiError(400, 'Chỉ chấp nhận file Excel .xlsx hoặc .xls.', null);
  if (file.size > MAX_PRICE_LIST_BYTES) throw new ApiError(400, 'File quy đổi tối đa 10 MB.', null);
  return uploadStoredFile(file, '/uploads/waybill-dimension-files', 'Không upload được file quy đổi kích thước.');
}

export function uploadVendorQrImage(file: File, vendorCode: string): Promise<string> {
  const normalizedVendorCode = vendorCode.trim().toUpperCase();
  if (!normalizedVendorCode) {
    throw new ApiError(400, 'Nhập mã NCC trước khi tải ảnh QR.', null);
  }
  return uploadImage(file, `/uploads/vendor-qr-images/${encodeURIComponent(normalizedVendorCode)}`);
}

export async function recognizeWaybillCodeWithGemini(file: File): Promise<string | null> {
  validateImageSource(file);
  const uploadFile = await optimizeMobilePhoto(file, {
    forceTransform: true,
    jpegQuality: 0.74,
    maxEdge: MAX_RECOGNITION_IMAGE_EDGE,
  });
  if (uploadFile.size > MAX_UPLOAD_BYTES) {
    throw new ApiError(400, 'Không thể nén ảnh nhận diện xuống dưới 5 MB.', null);
  }

  let attempt = await sendUploadAttempt(uploadFile, '/waybills/proof-of-delivery/recognize', getStoredAccessToken());
  if (attempt.response.status === 401) {
    const refreshed = await refreshTokenForUpload();
    if (refreshed.token) {
      attempt = await sendUploadAttempt(uploadFile, '/waybills/proof-of-delivery/recognize', refreshed.token);
    }
  }
  if (!attempt.response.ok) {
    throw new ApiError(
      attempt.response.status,
      getErrorMessage(attempt.payload, 'Gemini không nhận diện được ảnh.'),
      attempt.payload,
    );
  }
  if (!attempt.payload || typeof attempt.payload !== 'object' || !('waybill_code' in attempt.payload)) return null;
  const code = (attempt.payload as { waybill_code?: unknown }).waybill_code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

export function uploadCustomerPriceList(file: File, customerCode: string): Promise<string> {
  const normalizedCustomerCode = customerCode.trim().toUpperCase();
  if (!normalizedCustomerCode) {
    throw new ApiError(400, 'Nhập Mã KH trước khi tải bảng giá.', null);
  }
  const supported = /\.(?:pdf|jpe?g|png|webp)$/i.test(file.name);
  if (!supported) {
    throw new ApiError(400, 'Chỉ chấp nhận bảng giá PDF hoặc ảnh JPG, PNG, WebP.', null);
  }
  if (file.size > MAX_PRICE_LIST_BYTES) {
    throw new ApiError(400, 'File bảng giá tối đa 10 MB.', null);
  }
  return uploadStoredFile(
    file,
    `/uploads/customer-price-lists/${encodeURIComponent(normalizedCustomerCode)}`,
    'Không upload được file bảng giá.',
  );
}
