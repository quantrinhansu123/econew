import type { BillListItem } from './orderFormTypes';

const billDateKey = (bill: BillListItem) => {
  const [day, month, year] = bill.date.split('/').map((part) => part.trim());
  return day && month && year ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : '';
};

export const billMatchesDate = (bill: BillListItem, filterDate: string) =>
  !filterDate || billDateKey(bill) === filterDate;

export const sortBillsByBillDate = (bills: BillListItem[]) => [...bills].sort((left, right) => {
  const dateOrder = billDateKey(right).localeCompare(billDateKey(left));
  if (dateOrder) return dateOrder;
  return String(right.createdAt || '').localeCompare(String(left.createdAt || ''));
});
