import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiRequest } from '../../../lib/api';
import { uploadPaymentProof } from '../../../lib/uploadImage';
import { getStoredAuthUser } from '../../../lib/authUser';
import type { IncomingTrip } from './types';
import { FINANCE_ROLES, getManifestId, MANAGER_ROLES } from './incomingTripUtils';

export function useIncomingTripActions(refresh: (showLoading?: boolean) => Promise<void>) {
  const navigate = useNavigate();
  const user = useMemo(getStoredAuthUser, []);
  const canDelete = Boolean(user && (user.role_mask & MANAGER_ROLES) !== 0);
  const canPay = Boolean(user && (user.role_mask & FINANCE_ROLES) !== 0);

  const [deleteTrip, setDeleteTrip] = useState<IncomingTrip | null>(null);
  const [paymentTrip, setPaymentTrip] = useState<IncomingTrip | null>(null);
  const [viewTrip, setViewTrip] = useState<IncomingTrip | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');

  const openManifest = useCallback((trip: IncomingTrip, edit = false) => {
    const manifestId = getManifestId(trip);
    if (!manifestId) return;
    navigate(edit ? `/warehouse/manifests/${manifestId}?edit=1` : `/warehouse/manifests/${manifestId}`);
  }, [navigate]);

  const handleView = useCallback((trip: IncomingTrip) => {
    setActionError('');
    setViewTrip(trip);
  }, []);

  const handleEdit = useCallback((trip: IncomingTrip) => {
    openManifest(trip, true);
  }, [openManifest]);

  const handleDelete = useCallback((trip: IncomingTrip) => {
    setActionError('');
    setDeleteTrip(trip);
  }, []);

  const handlePayment = useCallback((trip: IncomingTrip) => {
    setActionError('');
    setPaymentTrip(trip);
  }, []);

  const closeDelete = useCallback(() => {
    if (isSubmitting) return;
    setDeleteTrip(null);
    setActionError('');
  }, [isSubmitting]);

  const closePayment = useCallback(() => {
    if (isSubmitting) return;
    setPaymentTrip(null);
    setActionError('');
  }, [isSubmitting]);

  const closeView = useCallback(() => {
    setViewTrip(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTrip) return;
    const manifestId = getManifestId(deleteTrip);
    if (!manifestId) {
      setActionError('Chuyến xe chưa có bảng kê để xóa.');
      return;
    }
    setIsSubmitting(true);
    setActionError('');
    try {
      await apiRequest(`/manifests/${manifestId}`, { method: 'DELETE' });
      setDeleteTrip(null);
      await refresh(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không xóa được bảng kê.');
    } finally {
      setIsSubmitting(false);
    }
  }, [deleteTrip, refresh]);

  const confirmPayment = useCallback(async (payload: {
    payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
    paid_amount?: number;
    fund_id?: string;
    cost_category?: string;
    proofFile?: File;
    payment_note?: string;
  }) => {
    if (!paymentTrip) return;
    setIsSubmitting(true);
    setActionError('');
    try {
      let proof_image_url: string | undefined;
      if (payload.payment_status === 'PAID') {
        if (!payload.proofFile) {
          setActionError('Đã thanh toán phải có ảnh chứng từ.');
          setIsSubmitting(false);
          return;
        }
        proof_image_url = await uploadPaymentProof(payload.proofFile);
      }
      await apiRequest('/vendors/trip-payables/payment-status', {
        method: 'PATCH',
        body: {
          trip_ids: [Number(paymentTrip.id)],
          payment_status: payload.payment_status,
          paid_amount: payload.paid_amount,
          fund_id: payload.fund_id,
          cost_category: payload.cost_category,
          proof_image_url,
          payment_note: payload.payment_note?.trim() || undefined,
        },
      });
      setPaymentTrip(null);
      await refresh(false);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Không cập nhật được thanh toán.');
    } finally {
      setIsSubmitting(false);
    }
  }, [paymentTrip, refresh]);

  return {
    canDelete,
    canPay,
    handleView,
    handleEdit,
    handleDelete,
    handlePayment,
    deleteTrip,
    paymentTrip,
    viewTrip,
    isSubmitting,
    actionError,
    closeDelete,
    closePayment,
    closeView,
    confirmDelete,
    confirmPayment,
  };
}
