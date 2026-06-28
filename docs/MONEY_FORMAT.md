# Định dạng số tiền (VNĐ)

> Quy ước chuẩn cho toàn bộ ECO Transport System v2.0 — hiển thị và nhập liệu tiền tệ Việt Nam.

## Quy tắc

| Ngữ cảnh | Quy tắc | Ví dụ |
|---|---|---|
| **Hiển thị** (bảng, label, tổng) | Dấu **chấm** phân cách hàng nghìn, hậu tố ` đ` | `1.500.000 đ` |
| **Ô nhập tiền** | `type="text"`, `inputMode="numeric"`, format khi gõ | Gõ `1500000` → hiện `1.500.000` |
| **Gửi API** | Số nguyên (không dấu chấm) | `1500000` |
| **Locale** | Luôn `vi-VN` | `toLocaleString('vi-VN')` |

**Không dùng** `type="number"` cho ô nhập tiền — trình duyệt không hỗ trợ dấu chấm phân cách và dễ lỗi parse.

## Module dùng chung

```ts
import {
  formatMoney,
  formatMoneyCurrency,
  formatAmountInput,
  formatAmountInputFromNumber,
  parseAmountInput,
  normalizeMoney,
} from '@/lib/formatMoney';
```

| Hàm | Mục đích |
|---|---|
| `formatMoney(value)` | Hiển thị: `1.500.000 đ` |
| `formatMoneyCurrency(value)` | Hiển thị Intl: `1.500.000 ₫` |
| `formatAmountInput(raw)` | Format khi user gõ trong `<input>` |
| `formatAmountInputFromNumber(1500000)` | Khởi tạo ô nhập từ số API |
| `parseAmountInput('1.500.000')` | Parse trước khi gọi API → `1500000` |
| `normalizeMoney(value)` | Chuẩn hóa string/number từ API |

## Pattern ô nhập tiền

```tsx
const [amountInput, setAmountInput] = useState('');

// Khởi tạo từ API
useEffect(() => {
  setAmountInput(formatAmountInputFromNumber(record.paid_amount));
}, [record]);

// Render
<input
  type="text"
  inputMode="numeric"
  value={amountInput}
  onChange={(e) => setAmountInput(formatAmountInput(e.target.value))}
  placeholder="Nhập số tiền (vd: 1.500.000)"
  className="tabular-nums ..."
/>

// Submit
const amount = parseAmountInput(amountInput);
if (amount <= 0) {
  setError('Nhập số tiền lớn hơn 0.');
  return;
}
await apiRequest('/...', { body: { paid_amount: amount } });
```

## Pattern hiển thị trong bảng

```tsx
<td className="text-right tabular-nums font-bold">
  {formatMoney(row.total_collect)}
</td>
```

Dùng class `tabular-nums` để cột số thẳng hàng.

## Xem ảnh chứng từ trong modal

**Không** mở tab/link mới (`target="_blank"`) khi xem ảnh chứng từ thanh toán, phiếu thu/chi, hoặc ảnh đính kèm tiền mặt — hiển thị **ngay trong modal** phủ lên dialog hiện tại.

### Component dùng chung

```tsx
import { ProofImageButton, ImagePreviewModal } from '@/components/ImagePreviewModal';

// Nút + modal tự quản lý state
<ProofImageButton
  imageUrl={record.proof_image_url}
  label="Xem ảnh"
  title="Chứng từ thanh toán NCC"
/>

// Hoặc điều khiển modal thủ công
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
<ImagePreviewModal imageUrl={previewUrl} title="Chứng từ" onClose={() => setPreviewUrl(null)} />
```

| Thành phần | Mục đích |
|---|---|
| `ProofImageButton` | Nút "Xem ảnh" — bấm mở modal, không điều hướng |
| `ImagePreviewModal` | Modal fullscreen nhẹ (`z-[10050]`), đóng bằng Esc / click nền / nút X |

### Quy tắc UX

- Ảnh `object-contain`, tối đa chiều cao viewport — không tràn layout
- Modal chứng từ nằm **trên** dialog cha (z-index cao hơn dialog chi tiết `z-[9999]`)
- Chỉ dùng link ngoài khi user chủ động tải file / mở URL gốc (không phải flow xem nhanh)

## Bộ lọc trang Hàng đến (`/warehouse/incoming`)

Trang **Tất cả chuyến xe** (`WarehouseIncomingPage`) lọc client-side trên danh sách từ `GET /trips/expected-arrivals`. Các bộ lọc kết hợp theo **AND** (thỏa đồng thời mọi điều kiện đang bật).

### Danh sách bộ lọc

| Bộ lọc | UI | Chọn nhiều | Gõ tìm | Giá trị / field |
|---|---|:---:|:---:|---|
| **Từ ngày → Đến ngày** | `<input type="date">` | — | — | `arrival_time` / `expected_arrival_time` / `estimated_arrival_time` — hàm `filterTripsByDateRange` |
| **BKS** | `FilterSelect` `multiple` | ✓ | ✓ | Biển số xe — `filterTripsByPlates` |
| **Trạng thái chuyến** | `FilterSelect` `multiple` | ✓ | ✓ | `PLANNED`, `IN_TRANSIT`, `ARRIVED`, `COMPLETED` — `filterTripsByStatuses` |
| **Trạng thái thanh toán** | `FilterSelect` `multiple` | ✓ | ✓ | `UNPAID` → Chờ TT · `PARTIAL` → Đề xuất TT · `PAID` → Đã TT — `filterTripsByPaymentStatuses` |
| **Nhà cung cấp** | Checkbox inline | ✓ | — | Tên NCC trên chuyến — `filterTripsByVendors` |

### Quy tắc hành vi

- **Mặc định:** mọi option đều được chọn (không lọc).
- **Bỏ chọn hết** trong một nhóm `FilterSelect` → không còn dòng nào (danh sách rỗng).
- **Bỏ chọn một phần** → chỉ giữ chuyến khớp các giá trị còn tick.
- **Nút Bỏ lọc:** reset ngày + chọn lại tất cả BKS / trạng thái chuyến / TT / NCC.
- Chip tổng hợp (tổng chuyến, phải thu, …) tính trên **danh sách sau lọc**.

### Trạng thái thanh toán (map API)

```ts
// incomingTripUtils.ts
UNPAID  → Chờ TT      // vendor_payment_status mặc định / chưa TT
PARTIAL → Đề xuất TT  // đã chi một phần
PAID    → Đã TT       // đã TT (bắt buộc số tiền + ảnh khi cập nhật)
```

`normalizeVendorPaymentStatus()` chuẩn hóa giá trị từ API trước khi lọc/hiển thị.

### Pattern thêm bộ lọc `FilterSelect` (checkbox + search)

```tsx
import { FilterSelect } from '@/components/ui/FilterSelect';

const [enabledPaymentStatuses, setEnabledPaymentStatuses] = useState<Set<string>>(new Set());
const paymentStatusOptions = useMemo(() => collectPaymentStatusOptions(trips), [trips]);
const paymentStatusValues = useMemo(() => paymentStatusOptions.map((o) => o.value), [paymentStatusOptions]);

// Sync khi danh sách option đổi (thêm option mới → auto tick)
useEffect(() => {
  setEnabledPaymentStatuses((prev) => {
    const next = new Set(prev);
    paymentStatusValues.forEach((v) => next.add(v));
    [...next].forEach((v) => { if (!paymentStatusValues.includes(v)) next.delete(v); });
    return next.size === prev.size && [...next].every((v) => prev.has(v)) ? prev : next;
  });
}, [paymentStatusValues]);

<FilterSelect
  multiple
  icon={Banknote}
  placeholder="Trạng thái thanh toán"
  searchPlaceholder="Gõ trạng thái TT..."
  options={paymentStatusOptions}
  value={Array.from(enabledPaymentStatuses)}
  onValueChange={(values) => setEnabledPaymentStatuses(new Set(values))}
/>

// Áp dụng lọc
let result = filterTripsByPaymentStatuses(trips, enabledPaymentStatuses, paymentStatusValues);
```

**Bắt buộc** với bộ lọc dạng dropdown: `multiple` + `searchPlaceholder` — **không** dùng `<select>` đơn khi cần chọn nhiều.

### File liên quan

| File | Vai trò |
|---|---|
| `client/src/pages/WarehouseIncomingPage.tsx` | State bộ lọc, pipeline `filteredTrips` |
| `client/src/pages/warehouse/incoming/IncomingTripsPageLayout.tsx` | UI bộ lọc |
| `client/src/pages/warehouse/incoming/incomingTripUtils.ts` | `collect*` / `filterTripsBy*` / `hasActiveIncomingFilters` |
| `client/src/components/ui/FilterSelect.tsx` | Dropdown checkbox + ô tìm kiếm |

## Cột bảng Hàng đến — Tổng phải trả & Ghi chú

Bảng chuyến xe trên `/warehouse/incoming` (`IncomingTripTable`) có nhóm cột **Tổng phải trả** (header 2 dòng):

| Cột UI | Nguồn dữ liệu | Ghi chú |
|---|---|---|
| **Phải trả** | `trips.trip_cost` | Cước phải trả NCC |
| **Bồi P trả** | `trips.vendor_paid_amount` | Số tiền đã chi / bồi hoàn |
| **Phí khác** | `trips.other_costs` | Chi phí phát sinh khác |
| **Phải thu** | `total_collect` (tổng từ waybill) | COD + CC — số tiền phải thu trên chuyến |
| **Lái xe đã thu** | `total_collect` (hiện tại) | Tiền lái xe đã thu trên xe (cùng nguồn cho đến khi có field riêng) |
| **Ghi chú** | `trips.vendor_payment_note` | Nhập khi **Thanh toán**; header màu đỏ |
| **Thao tác** | Menu ⋮ (`RowActionsMenu`) | Xem · Sửa · Xóa · Thanh toán — không render nhiều nút trong cell |

Hiển thị tiền: `formatMoney()` + `tabular-nums`. Ô trống / 0 → `—`.

### Dialog thanh toán

`IncomingTripPaymentDialog` có textarea **Ghi chú** (đỏ, `maxLength={500}`). Gửi API:

```ts
PATCH /api/v1/vendors/trip-payables/payment-status
{ trip_ids, payment_status, paid_amount?, proof_image_url?, payment_note? }
```

### DB migration

Cột `vendor_payment_note` (varchar 500) — migration `1784000000000-AddTripVendorPaymentNote.ts`:

```sql
ALTER TABLE trips ADD COLUMN IF NOT EXISTS vendor_payment_note varchar(500);
```

## Checklist khi làm tính năng mới

- [ ] Hiển thị tiền → `formatMoney()` từ `@/lib/formatMoney`
- [ ] Ô nhập tiền → `formatAmountInput` + `parseAmountInput`, **không** `type="number"`
- [ ] API body → số nguyên (`number`), không gửi chuỗi có dấu chấm
- [ ] Không copy/paste helper `formatAmountInput` cục bộ — import từ lib
- [ ] Xem ảnh chứng từ → `ProofImageButton` / `ImagePreviewModal`, **không** `target="_blank"`
- [ ] Bộ lọc chọn nhiều + tìm kiếm → `FilterSelect` `multiple` + `searchPlaceholder` (xem mục Hàng đến)

## Tham chiếu trong codebase

- Trang hàng đến + bộ lọc: `client/src/pages/WarehouseIncomingPage.tsx`
- Utils lọc chuyến: `client/src/pages/warehouse/incoming/incomingTripUtils.ts`

- Dialog thanh toán NCC: `client/src/pages/warehouse/incoming/dialogs/IncomingTripPaymentDialog.tsx`
- Chi tiết chuyến + lịch sử TT: `client/src/pages/warehouse/incoming/dialogs/IncomingTripDetailDialog.tsx`
- Modal xem ảnh: `client/src/components/ImagePreviewModal.tsx`
- Phiếu thu/chi vận đơn: `client/src/pages/warehouse/inventory/dialogs/WaybillCashVoucherDialog.tsx`
- Cột phải thu hàng đến: `incomingTripUtils.formatCollectAmount` (dùng `formatMoney`)

## Agent / AI

Khi task liên quan nhập hoặc hiển thị tiền, đọc file này và dùng `client/src/lib/formatMoney.ts` — không tạo helper trùng lặp.
