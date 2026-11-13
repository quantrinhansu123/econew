import { CustomerPaymentStatus } from '../common/enums';

export function resolveCustomerPaymentStatus(
  currentStatus: CustomerPaymentStatus | null | undefined,
  totalDue: number,
  netPaid: number,
): CustomerPaymentStatus | null {
  if (totalDue <= 0 && currentStatus === CustomerPaymentStatus.NO_CHARGE) {
    return CustomerPaymentStatus.NO_CHARGE;
  }
  if (totalDue > 0 && netPaid >= totalDue) return CustomerPaymentStatus.PAID;
  if (netPaid > 0) return CustomerPaymentStatus.PARTIAL;
  return currentStatus === CustomerPaymentStatus.SENT_STATEMENT ? currentStatus : null;
}
