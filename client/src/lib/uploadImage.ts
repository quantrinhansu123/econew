import { ApiError } from './api';
import { resolveApiBaseUrl } from './apiBaseUrl';

const API_BASE_URL = resolveApiBaseUrl();

const ACCESS_TOKEN_KEY = 'eco_access_token';

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

export async function uploadPaymentProof(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new ApiError(400, 'Chỉ chấp nhận file ảnh.', null);
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new ApiError(400, 'Ảnh tối đa 5 MB.', null);
  }

  const token = getStoredAccessToken();
  const formData = new FormData();
  formData.append('file', file);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/uploads/payment-proofs`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
  } catch {
    throw new ApiError(0, 'Không kết nối được server để upload ảnh.', null);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(payload, 'Không upload được ảnh.'), payload);
  }

  const url = payload && typeof payload === 'object' && 'url' in payload
    ? String((payload as { url: unknown }).url)
    : '';
  if (!url.trim()) {
    throw new ApiError(502, 'Server không trả về URL ảnh.', payload);
  }
  return url.trim();
}
