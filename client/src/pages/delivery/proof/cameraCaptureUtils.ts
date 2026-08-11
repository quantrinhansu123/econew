export const createCameraCaptureFile = (blob: Blob, capturedAt = Date.now()) => {
  const timestamp = new Date(capturedAt).toISOString().replace(/[:.]/g, '-');
  return new File([blob], `bao-phat-${timestamp}.jpg`, {
    type: 'image/jpeg',
    lastModified: capturedAt,
  });
};

export const cameraFailureMessage = (error: unknown) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Trình duyệt chưa được cấp quyền camera. Hãy cho phép camera trên thanh địa chỉ rồi thử lại.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Không tìm thấy camera trên thiết bị này. Chị có thể chọn ảnh thay thế.';
  }
  return 'Không mở được camera. Chị có thể thử lại hoặc chọn ảnh thay thế.';
};
