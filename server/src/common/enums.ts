export enum WaybillState {
  RECEIVED = 'RECEIVED',
  IN_WAREHOUSE = 'IN_WAREHOUSE',
  MANIFEST_CLOSED = 'MANIFEST_CLOSED',
  LOADED = 'LOADED',
  IN_TRANSIT = 'IN_TRANSIT',
  AT_DEST_HUB = 'AT_DEST_HUB',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentType {
  PP = 'PP',
  CC = 'CC',
  COD = 'COD',
}

export enum RemittanceStatus {
  PENDING = 'PENDING',
  REMITTED = 'REMITTED',
  OVERDUE = 'OVERDUE',
}

export enum TripStatus {
  PLANNED = 'PLANNED',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
  COMPLETED = 'COMPLETED',
}

export enum VendorTripPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
}

export enum CustomerPaymentStatus {
  SENT_STATEMENT = 'SENT_STATEMENT',
  PAID = 'PAID',
}

