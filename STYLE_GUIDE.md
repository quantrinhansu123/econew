# STYLE_GUIDE.md

> Hướng dẫn này được rút ra trực tiếp từ các file hiện có trong project. Lưu ý: file trang ứng viên thực tế đang nằm ở `client/src/pages/CandidatesPage.tsx` và import dữ liệu từ `client/src/pages/candidates/*`; đường dẫn `src/pages/candidates/CandidatesPage.tsx` trong yêu cầu không tồn tại trong workspace hiện tại.

### Định dạng số tiền VNĐ

Xem chi tiết **`docs/MONEY_FORMAT.md`**. Tóm tắt:

- Hiển thị: `formatMoney(value)` → `1.500.000 đ` (`client/src/lib/formatMoney.ts`)
- Ô nhập: `type="text"` + `inputMode="numeric"`, `formatAmountInput` khi gõ, `parseAmountInput` trước API
- Xem ảnh chứng từ: `ProofImageButton` trong modal — không `target="_blank"` (xem `docs/MONEY_FORMAT.md`)
- Bộ lọc hàng đến (`/warehouse/incoming`): `FilterSelect` multiple + search; trạng thái TT `UNPAID`/`PARTIAL`/`PAID` — xem `docs/MONEY_FORMAT.md`
- Không dùng `type="number"` cho tiền; không copy helper format cục bộ

## 1. Cấu trúc thư mục chuẩn cho module mới

Module đang có pattern tách **page chính** ở `pages/` và phần riêng của module ở thư mục con cùng domain.

Ví dụ thực tế:

```txt
client/src/pages/CandidatesPage.tsx
client/src/pages/candidates/data.ts
client/src/pages/candidates/types.ts
client/src/pages/candidates/dialogs/AddEditCandidateDialog.tsx
client/src/pages/candidates/dialogs/CandidateDetailDialog.tsx
client/src/pages/candidates/dialogs/AddEditInterviewDialog.tsx
client/src/pages/candidates/dialogs/InterviewDetailDialog.tsx
```

Khi tạo module mới, bám theo cấu trúc này:

```txt
client/src/pages/NewModulePage.tsx
client/src/pages/new-module/types.ts
client/src/pages/new-module/data.ts
client/src/pages/new-module/dialogs/AddEditNewModuleDialog.tsx
client/src/pages/new-module/dialogs/NewModuleDetailDialog.tsx
```

Các import trong page chính lấy dữ liệu/types/dialog từ thư mục con module, như `CandidatesPage.tsx`:

```tsx
import {
  candidatesData, statusConfig, sourceConfig,
  statusOptions, positionOptions, sourceOptions, mockInterviewSessions,
} from './candidates/data';
import type { Candidate, CandidateDocument, CandidateFormState, InterviewFormState, FilterOption, InterviewSession } from './candidates/types';
import AddEditCandidateDialog from './candidates/dialogs/AddEditCandidateDialog';
import CandidateDetailDialog from './candidates/dialogs/CandidateDetailDialog';
```

## 2. Pattern trang chuẩn

### Layout tổng

App dùng `MainLayout` bọc các route con qua `Outlet`:

```tsx
<div className="flex h-screen bg-background text-foreground overflow-hidden">
  <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

  <div 
    className={clsx(
      "flex-1 flex flex-col w-full min-w-0 transition-all duration-300",
      sidebarOpen ? "lg:ml-64" : "lg:ml-[72px]"
    )}
  >
    <Topbar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

    <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6 custom-scrollbar">
      <div className="w-full h-full flex flex-col">
        <Outlet />
      </div>
    </main>

    <MobileBottomNav />
  </div>
</div>
```

### Import page chuẩn

`CandidatesPage.tsx` gom import theo nhóm: React/hooks, icon, router, utility, data/types, dialogs, chart.

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft, Search, Plus, Filter,
  Edit, Trash2, X, BarChart2, Users, TrendingUp,
  ChevronRight, List, Columns, GripVertical,
  RotateCcw, Tag as TagIcon, Briefcase,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
```

### State management trong page

Page ứng viên dùng state cục bộ cho tab/view/filter/modal/form. Ví dụ form state được gom thành object và update qua helper generic:

```tsx
const [formState, setFormState] = useState<CandidateFormState>(emptyCandidateForm);

const setFormField = <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => {
  setFormState(prev => ({ ...prev, [key]: value }));
};
```

Các dialog nhận state từ page cha và callback để đóng/mở:

```tsx
<AddEditCandidateDialog
  isOpen={isAddModalOpen}
  isClosing={isAddModalClosing}
  isEditMode={isEditMode}
  onClose={() => closeAddModal()}
  formState={formState}
  setFormField={setFormField}
  positionOptions={positionOptions}
/>
```

### Wrapper và className thường gặp

Các khối nội dung dùng card trắng, bo góc lớn, border và shadow nhẹ:

```tsx
<div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
  <div className="px-5 py-3 border-b border-border bg-muted/5 flex items-center gap-2">
    <User size={16} className="text-primary" />
    <span className="text-[12px] font-bold text-primary uppercase tracking-wider">Thông tin cá nhân</span>
  </div>
</div>
```


### Data table shell chuẩn cho trang danh sách quản trị

Các trang danh sách dạng quản trị (xe, hub, vận đơn tồn kho, người dùng, bảng kê...) phải ưu tiên pattern **một card lớn chứa toolbar + filter + table + footer** giống `AdminTrucksPage` và `WarehouseInventoryPage`. Không tạo hero/header card riêng hoặc stat cards phía trên nếu trang mục tiêu là bảng dữ liệu thuần.

Khung ngoài bắt buộc dùng chiều cao linh hoạt để footer luôn nằm dưới cùng, kể cả khi loading/empty/no data:

```tsx
<div className="h-full min-h-0 flex flex-col gap-2">
  {actionError && <Alert message={actionError} />}

  <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
    <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
      {/* toolbar + desktop filters */}
    </div>

    <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
      {/* loading / empty / table / mobile cards */}
    </div>

    <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
      {/* pagination */}
    </div>
  </div>
</div>
```

Điểm quan trọng: `flex-1 min-h-0 overflow-auto` phải bọc cả empty state và table. Không đặt empty state trực tiếp là sibling của footer, vì footer sẽ bị đẩy lên giữa card khi không có dữ liệu.

### Toolbar trong table shell

Toolbar đầu bảng dùng đúng cấu trúc sau:

```tsx
<div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
  <div className="flex flex-wrap items-center gap-2">
    <button
      onClick={() => window.history.back()}
      className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"
    >
      <ArrowLeft size={15} />
      <span className="hidden md:inline">Quay lại</span>
    </button>

    <div className="relative min-w-0 flex-1 md:max-w-[460px]">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input
        value={filters.keyword}
        onChange={event => updateFilters({ keyword: event.target.value })}
        placeholder="Tìm kiếm..."
        className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
      />
    </div>

    <button
      title="Mở bộ lọc"
      onClick={openFilterPanel}
      className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"
    >
      <Filter size={16} />
      {activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}
    </button>

    {activeFilterCount > 0 && (
      <div className="order-last basis-full md:order-none md:basis-auto">
        <button onClick={clearFilters} className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10">
          × Xóa {activeFilterCount} bộ lọc
        </button>
      </div>
    )}

    <div className="hidden flex-1 md:block" />
  </div>
</div>
```

Nút quay lại dùng `ArrowLeft`, không dùng `ChevronLeft`. Trên mobile chỉ là icon vuông `w-10`; trên desktop mở rộng `md:w-auto md:px-3` và hiện text.

### Filter desktop và mobile

Filter có hai behavior riêng:

- Desktop `md+`: filter phải hiện inline ngay dưới searchbar bằng `FilterSelect` hoặc control tương đương. Không mở bottom sheet trên desktop.
- Mobile `< md`: chỉ hiện icon filter trong toolbar; filter mở bằng panel/bottom sheet trượt từ dưới.

Desktop inline filter mẫu:

```tsx
<div className="hidden flex-wrap items-center gap-2 md:flex">
  <FilterSelect multiple icon={Tag} placeholder="Trạng thái" options={statusOptions} value={filters.statuses} onValueChange={value => setFilterArray('statuses', value)} />
  <FilterSelect multiple icon={Building2} placeholder="Bưu cục" options={hubOptions} value={filters.hubIds} onValueChange={value => setFilterArray('hubIds', value)} />
  <FilterSelect multiple icon={CreditCard} placeholder="Loại thanh toán" options={paymentOptions} value={filters.paymentTypes} onValueChange={value => setFilterArray('paymentTypes', value)} />
</div>
```

Mobile filter panel/bottom sheet bắt buộc có `md:hidden` ở root:

```tsx
<div className="fixed inset-0 z-50 flex items-end justify-center md:hidden">
  <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
  <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[28px] border border-border bg-background shadow-2xl">
    {/* header Bộ lọc + accordion groups + footer Áp dụng */}
  </div>
</div>
```

### Table desktop và mobile cards

Desktop table:

```tsx
<table className="hidden md:table w-full min-w-[1280px] text-left border-collapse">
  <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
    <tr>
      {headers.map(header => (
        <th key={header} className="px-4 py-2.5 font-bold border-r border-border last:border-r-0">{header}</th>
      ))}
    </tr>
  </thead>
  <tbody>{rows.map(row => <Row key={row.id} row={row} />)}</tbody>
</table>
```

Row cell dùng `border-r border-border`, text `text-[13px]`, hover `hover:bg-muted/10`, và truncate ở cột có nội dung dài.

Mobile `< md`: không dùng bảng ngang. Dùng card dọc giống pattern:

```tsx
<article className="rounded-2xl border border-border bg-white p-4 shadow-sm">
  <div className="flex items-start gap-3">
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-primary">
      <Package size={20} />
    </div>
    <div className="min-w-0 flex-1">
      <h3 className="truncate text-[15px] font-extrabold text-primary">{code}</h3>
      <p className="mt-1 truncate text-[12px] font-medium text-muted-foreground">{subtitle}</p>
    </div>
  </div>
</article>
```

### Cột Thao tác — menu ba chấm dọc

**Bắt buộc** với bảng có nhiều action trên từng dòng (Xem, Sửa, Xóa, Thanh toán, …): gom vào **một nút ba chấm dọc** (`MoreVertical`), không render hàng nút có chữ trong cell.

```tsx
import { RowActionsMenu, RowActionsMenuItem } from '@/components/ui/RowActionsMenu';

<RowActionsMenu label="Thao tác chuyến xe">
  <RowActionsMenuItem icon={<Eye size={14} />} label="Xem" tone="primary" onClick={() => onView(row)} />
  <RowActionsMenuItem icon={<Edit size={14} />} label="Sửa" tone="amber" disabled={!canEdit} onClick={() => onEdit(row)} />
  <RowActionsMenuItem icon={<Trash2 size={14} />} label="Xóa" tone="danger" disabled={!canDelete} onClick={() => onDelete(row)} />
</RowActionsMenu>
```

| Quy tắc | Chi tiết |
|---|---|
| Trigger | `h-8 w-8`, `MoreVertical`, `aria-label` mô tả |
| Menu | `absolute right-0 z-30`, `rounded-xl`, `shadow-xl`, đóng khi click ngoài / `Escape` |
| Item | `RowActionsMenuItem` — icon + label, `tone` theo mức độ (primary / amber / emerald / danger) |
| Cột bảng | `text-center`, `min-w-[72px]` — chỉ đủ chỗ cho nút ⋮ |
| Tham chiếu | `IncomingTripRowActions.tsx`, `WarehouseInventoryPage` (pattern tương tự) |

### Empty/loading state và footer pagination

Empty/loading state nằm trong body `flex-1`, không thay thế toàn bộ card:

```tsx
<div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
  {isLoading ? (
    <StateCard compact icon={<Loader2 className="animate-spin" size={24} />} title="Đang tải dữ liệu" description="..." />
  ) : items.length === 0 ? (
    <StateCard compact icon={<Package size={24} />} title="Chưa có dữ liệu phù hợp" description="Thử thay đổi từ khóa hoặc bộ lọc." />
  ) : tableContent}
</div>
```

Footer pagination luôn là sibling cuối cùng của body và có `shrink-0`:

```tsx
<div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between shrink-0">
  <p className="text-[12px] font-medium text-muted-foreground">1-{items.length}/Tổng:{total}</p>
  <div className="flex items-center gap-2">
    <select className="h-9 rounded-lg border border-border bg-white px-3 text-[13px] text-muted-foreground outline-none" />
    <span className="hidden text-[12px] text-muted-foreground sm:inline">/ trang</span>
    <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronLeft size={16} /></button>
    <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground disabled:opacity-50"><ChevronRight size={16} /></button>
    <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-primary px-2 text-[13px] font-bold text-white">{page}</span>
    <span className="text-[13px] font-bold text-foreground">/ {totalPages}</span>
  </div>
</div>
```

## 3. Pattern dialog chuẩn

### Add/Edit dialog

`AddEditCandidateDialog` dùng props gồm open/closing/edit mode, callback đóng, form state, setter generic và options:

```tsx
interface Props {
  isOpen: boolean;
  isClosing: boolean;
  isEditMode: boolean;
  onClose: () => void;
  formState: CandidateFormState;
  setFormField: <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => void;
  positionOptions: FilterOption[];
}
```

Dialog không render khi đã đóng và không còn animation closing:

```tsx
if (!isOpen && !isClosing) return null;
```

Dialog render bằng portal vào `document.body`:

```tsx
return createPortal(
  <div className="fixed inset-0 z-[9999] flex justify-end">
    {/* Backdrop */}
    <div
      className={clsx(
        'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-350 ease-out',
        isClosing ? 'opacity-0' : 'animate-in fade-in duration-300',
      )}
      onClick={onClose}
    />
```

Panel Add/Edit dùng slide animation từ `index.css`:

```tsx
<div
  className={clsx(
    'relative w-full max-w-[750px] bg-[#f8fafc] shadow-2xl flex flex-col h-screen border-l border-border',
    isClosing
      ? 'dialog-slide-out'
      : 'dialog-slide-in',
  )}
>
```

Header đổi title theo `isEditMode`:

```tsx
<h2 className="text-lg font-bold text-foreground">
  {isEditMode ? 'Chỉnh sửa ứng viên' : 'Thêm ứng viên'}
</h2>
```

Form section chuẩn gồm title section, grid responsive, label, icon absolute và input:

```tsx
<div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
  <div className="space-y-1.5">
    <label className="text-[13px] font-bold text-foreground">Họ tên <span className="text-red-500">*</span></label>
    <div className="relative">
      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" size={16} />
      <input
        type="text"
        placeholder="Nhập họ tên"
        value={formName}
        onChange={e => setFormField('formName', e.target.value)}
        className="w-full pl-10 pr-4 py-2 bg-muted/10 border border-border rounded-xl text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all"
      />
    </div>
  </div>
</div>
```

### Detail dialog

Detail dialog của trang danh sách phải dùng dạng **drawer bên phải**, không dùng modal căn giữa.
Drawer mở bằng `dialog-slide-in`, đóng bằng `dialog-slide-out` rồi mới unmount để tránh giật layout.

`EntityDetailDialog` nhận record hiện tại, state closing và callbacks thao tác chi tiết:

```tsx
interface Props {
  item: Entity | null;
  isClosing: boolean;
  canManage: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: Entity) => void;
  onDelete: (item: Entity) => void | Promise<void>;
}
```

Guard render:

```tsx
if (!item && !isClosing) return null;
if (!item) return null;
```

Shell drawer chuẩn:

```tsx
return createPortal(
  <div className="fixed inset-0 z-[9999] flex justify-end">
    <div
      className={clsx(
        'fixed inset-0 bg-black/40 backdrop-blur-md transition-all duration-300 ease-out',
        isClosing ? 'opacity-0' : 'animate-in fade-in duration-200',
      )}
      onClick={onClose}
    />

    <div
      className={clsx(
        'relative flex h-screen w-full max-w-[680px] flex-col border-l border-border bg-[#f8fafc] shadow-2xl',
        isClosing ? 'dialog-slide-out' : 'dialog-slide-in',
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-primary">Chi tiết bản ghi</p>
          <h2 className="text-lg font-black text-foreground">{item.name}</h2>
        </div>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        {/* Detail sections */}
      </div>

      {/* Footer chuẩn ở dưới */}
    </div>
  </div>,
  document.body,
);
```

Nội dung detail chia thành các card section giống `AdminTrucksPage`:

```tsx
function DetailSection({ title, icon: Icon, children }: PropsWithChildren<{ title: string; icon: LucideIcon }>) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-border bg-muted/5 px-5 py-3">
        <Icon size={16} className="text-primary" />
        <span className="text-[12px] font-bold uppercase tracking-wider text-primary">{title}</span>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}
```

Footer detail bắt buộc có `Đóng` bên trái, cụm action bên phải. Không dùng một nút `Đóng` full-width:

```tsx
<div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card p-5">
  <button
    onClick={onClose}
    className="rounded-xl border border-border bg-white px-5 py-3 text-[13px] font-bold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
  >
    Đóng
  </button>

  <div className="flex items-center gap-3">
    {canManage && (
      <button
        onClick={() => onEdit(item)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-[13px] font-bold text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary/90"
      >
        <Edit size={16} />
        Sửa
      </button>
    )}
    {canDelete && (
      <button
        onClick={() => void onDelete(item)}
        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100"
      >
        <Trash2 size={16} />
        Xóa
      </button>
    )}
  </div>
</div>
```

### Confirm dialog

Mọi thao tác cần xác nhận của người dùng **bắt buộc** dùng `ConfirmDialog` chung, không dùng `window.confirm`, `alert` hoặc confirm mặc định của browser.

Áp dụng bắt buộc cho:

- Xóa 1 bản ghi.
- Bulk delete nhiều bản ghi.
- Đổi trạng thái có tác động dữ liệu.
- Hủy/sửa thao tác có nguy cơ mất dữ liệu.

Import component chuẩn:

```tsx
import { ConfirmDialog, type ConfirmDialogState } from '../../components/ui/ConfirmDialog';
```

State trong page:

```tsx
const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>(null);
```

Mở confirm dialog:

```tsx
setConfirmDialog({
  title: 'Xóa xe',
  message: `Xóa xe ${formatPlate(truck)}?`,
  confirmLabel: 'Xóa',
  danger: true,
  onConfirm: async () => {
    await apiRequest(`/trucks/${truck.id}`, { method: 'DELETE' });
    await fetchItems();
  },
});
```

Render ở cuối page, cùng cấp với form/detail/filter dialog:

```tsx
<ConfirmDialog
  dialog={confirmDialog}
  isSubmitting={isSubmitting}
  onClose={() => setConfirmDialog(null)}
/>
```

Anti-pattern — KHÔNG làm:

```tsx
if (!window.confirm('Xóa bản ghi này?')) return;
alert('Đã lưu');
```

## 4. Component `/ui` đang có và cách dùng

### `RowActionsMenu`

Menu thao tác từng dòng trong bảng — nút **ba chấm dọc**, dropdown danh sách action.

```tsx
import { RowActionsMenu, RowActionsMenuItem } from '@/components/ui/RowActionsMenu';

<RowActionsMenu label="Mở thao tác" align="right">
  <RowActionsMenuItem icon={<Eye size={14} />} label="Xem" onClick={handleView} />
</RowActionsMenu>
```

| Prop / thành phần | Mục đích |
|---|---|
| `RowActionsMenu` | State mở/đóng, click-outside, `align` `left` \| `right` |
| `RowActionsMenuItem` | Một dòng action; `tone`: `primary` \| `amber` \| `emerald` \| `danger` |
| `disabled` + `title` | Ẩn/hiện quyền và tooltip lý do không bấm được |

Xem thêm mục **Cột Thao tác — menu ba chấm dọc** (§2).

### `ActionCard`

Props thực tế:

```tsx
export interface ActionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  href: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber';
}
```

Component render `Link` và nhận icon component:

```tsx
export const ActionCard: React.FC<ActionCardProps> = ({
  icon: Icon,
  title,
  description,
  href,
  colorScheme
}) => {
  return (
    <Link
      to={href}
      className="group relative block bg-card rounded-[24px] p-6 transition-all duration-300 hover:shadow-xl border border-border hover:border-primary/20 hover:-translate-y-1"
    >
```

Cách dùng thực tế là truyền props vào component; bên trong component dùng `href` cho `Link` và `colorScheme` để lấy class từ `colorMap`:

```tsx
<Link
  to={href}
  className="group relative block bg-card rounded-[24px] p-6 transition-all duration-300 hover:shadow-xl border border-border hover:border-primary/20 hover:-translate-y-1"
>
```

### `ModuleCard`

Props thực tế:

```tsx
export interface ModuleCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  colorScheme: 'red' | 'green' | 'pink' | 'blue' | 'orange' | 'teal' | 'purple' | 'cyan' | 'emerald' | 'amber' | 'slate';
  path?: string;
}
```

Nếu có `path`, component navigate khi click:

```tsx
const handleClick = () => {
  if (path) {
    navigate(path);
  }
};
```

Nếu không có `path`, component tự chuyển sang trạng thái disabled:

```tsx
className={clsx(
  "group flex items-center bg-card rounded-xl p-4 transition-all duration-300 border border-border hover:border-primary/30 hover:shadow-sm cursor-pointer hover:-translate-y-0.5",
  !path && "opacity-60 grayscale-[0.5] cursor-not-allowed hover:translate-y-0 hover:border-border"
)}
```

Ví dụ item thực tế trong `moduleData.ts` có đủ props cho `ModuleCard`:

```tsx
{ icon: UserPlus, title: 'Ứng viên', description: 'Quản lý hồ sơ, trạng thái ứng viên.', colorScheme: 'purple', path: '/nhan-su/ung-vien' }
```

### `SearchableSelect`

Props thực tế:

```tsx
interface SearchableSelectProps {
  options: Option[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  className?: string
  disabled?: boolean
}
```

Component dùng `Popover`, `Command`, có clear bằng icon `X`:

```tsx
{value && !disabled && (
  <X
    size={14}
    className="text-muted-foreground/40 hover:text-red-500 transition-colors cursor-pointer"
    onClick={(e) => {
      e.stopPropagation()
      onValueChange("")
    }}
  />
)}
```

Ví dụ dùng thực tế với `positionOptions` trong candidate dialog:

```tsx
<SearchableSelect
  options={positionOptions.map(p => ({ value: p.id, label: p.label }))}
  value={formPosition}
  onValueChange={(v: string) => setFormField('formPosition', v)}
  placeholder="Chọn đề xuất tuyển dụng"
/>
```

### `command.tsx`

`command.tsx` wrap `cmdk` primitive và export các phần nhỏ:

```tsx
export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
```

Ví dụ thực tế từ `SearchableSelect`:

```tsx
<Command className="rounded-xl overflow-hidden">
  <div className="flex items-center border-b border-border/40 px-3 bg-muted/5">
    <Search className="mr-2 h-4 w-4 shrink-0 opacity-40" />
    <CommandInput 
      placeholder={searchPlaceholder} 
      className="h-10 border-none px-0 text-[13px] focus:ring-0"
    />
  </div>
</Command>
```

### `popover.tsx`

`popover.tsx` wrap Radix Popover:

```tsx
const Popover = PopoverPrimitive.Root
const PopoverTrigger = PopoverPrimitive.Trigger
const PopoverAnchor = PopoverPrimitive.Anchor
```

Content mặc định có z-index rất cao và animation data-state:

```tsx
<PopoverPrimitive.Content
  ref={ref}
  align={align}
  sideOffset={sideOffset}
  className={cn(
    "z-[99999] w-72 rounded-xl border bg-white p-0 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
    className
  )}
  {...props}
/>
```

Ví dụ thực tế từ `SearchableSelect`:

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <button disabled={disabled}>...</button>
  </PopoverTrigger>
  <PopoverContent className="w-full min-w-[var(--radix-popover-trigger-width)] p-0 shadow-xl border-border/60">
    ...
  </PopoverContent>
</Popover>
```

## 5. Cách khai báo `types.ts` và `data.ts` của module

### `types.ts`

`types.ts` khai báo interface domain, option/filter, state form. Ví dụ `candidates/types.ts`:

```tsx
export interface CandidateDocument {
  id: string;
  name: string;
  type: string;
  link: string;
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthYear: string;
  position: string;
  positionId: string;
  status: 'new' | 'interviewing' | 'hired' | 'rejected';
  source: string;
  latestInterview: string;
  latestResult: string;
  createdAt: string;
  documents: CandidateDocument[];
}
```

Options dùng shape `{ id, label, count }`:

```tsx
export interface FilterOption {
  id: string;
  label: string;
  count: number;
}
```

Form state được khai báo riêng, field form có prefix `form` hoặc `iv`:

```tsx
export interface CandidateFormState {
  formName: string;
  formEmail: string;
  formPhone: string;
  formAddress: string;
  formBirthYear: string;
  formBirthDate: string;
  formSource: string;
  formPosition: string;
  formStatus: string;
  formLatestInterview: string;
  formLatestResult: string;
  formInternalNotes: string;
  formDocuments: CandidateDocument[];
}
```

### `data.ts`

`data.ts` import type từ `types.ts`, export mock data, config map và options.

```tsx
import type { Candidate, FilterOption, InterviewSession } from './types';
```

Mock data dùng đúng interface domain:

```tsx
export const candidatesData: Candidate[] = [
  {
    id: '1',
    name: 'Nguyễn Văn A',
    email: 'nguyenvana@email.com',
    phone: '0901234567',
    birthYear: '1995',
    position: 'Lập trình viên Senior',
    positionId: 'DX-2025-001',
    status: 'interviewing',
    source: 'Website công ty',
    latestInterview: '16:00 - 10/02/2025',
    latestResult: 'Đạt, chờ vòng 2',
    createdAt: '17:00 - 15/01/2025',
    documents: [
      { id: 'd1', name: 'CV_Nguyen_Van_A.pdf', type: 'CV', link: '#' },
      { id: 'd2', name: 'Bang_dai_hoc.pdf', type: 'Bằng cấp', link: '#' },
    ],
  },
];
```

Config map dùng `Record` theo union type từ domain:

```tsx
export const statusConfig: Record<Candidate['status'], { label: string; classes: string }> = {
  new: { label: 'Mới', classes: 'bg-blue-500/10 text-blue-600 border-blue-200' },
  interviewing: { label: 'Mời phỏng vấn', classes: 'bg-sky-500/10 text-sky-600 border-sky-100' },
  hired: { label: 'Nhận việc', classes: 'bg-indigo-500/10 text-indigo-600 border-indigo-100' },
  rejected: { label: 'Từ chối', classes: 'bg-emerald-500/10 text-emerald-600 border-emerald-100' },
};
```

Options dùng `FilterOption[]`:

```tsx
export const positionOptions: FilterOption[] = [
  { id: 'DX-2025-001', label: 'DX-2025-001 · Lập trình viên Senior', count: 2 },
  { id: 'DX-2025-002', label: 'DX-2025-002 · Chuyên viên Tuyển dụng', count: 1 },
  { id: 'DX-2025-004', label: 'DX-2025-004 · Lập trình viên Frontend', count: 1 },
];
```

## 6. Cách đăng ký route mới trong `App.tsx`

`App.tsx` import page ở đầu file:

```tsx
import CandidatesPage from './pages/CandidatesPage';
```

Routes nằm trong `<Route element={<MainLayout />}>`:

```tsx
<Route element={<MainLayout />}>
  <Route path="/" element={<Dashboard />} />
  <Route path="/ho-so" element={<ProfilePage />} />
  <Route path="/hanh-chinh" element={<ModulePage />} />
  <Route path="/nhan-su" element={<ModulePage />} />
  <Route path="/nhan-su/ung-vien" element={<CandidatesPage />} />
```

Thêm route module mới bằng cách import page và thêm route cùng cấp. Fallback hiện có luôn chuyển về `/`:

```tsx
<Route path="*" element={<Navigate to="/" replace />} />
```

## 7. Cách thêm menu item vào `sidebarMenu.ts` và `moduleData.ts`

### Sidebar chính

`sidebarMenu.ts` định nghĩa type item:

```tsx
export type SidebarItem = {
  icon: React.ElementType;
  label: string;
  path: string;
};
```

Menu chính thêm item vào `sidebarMenu`:

```tsx
export const sidebarMenu: SidebarItem[] = [
  { icon: Home, label: 'Trang chủ', path: '/' },
  { icon: FileText, label: 'Hành chính', path: '/hanh-chinh' },
  { icon: Users, label: 'Nhân sự', path: '/nhan-su' },
  { icon: Megaphone, label: 'Marketing', path: '/marketing' },
  { icon: Wallet, label: 'Tài chính', path: '/tai-chinh' },
  { icon: ShoppingCart, label: 'Mua hàng', path: '/mua-hang' },
  { icon: Box, label: 'Kho vận', path: '/kho-van' },
  { icon: Layers, label: 'Hệ thống', path: '/he-thong' }
];
```

Menu phụ thêm vào `extraMenuItems`:

```tsx
export const extraMenuItems: SidebarItem[] = [
  { icon: Bot, label: 'Trợ lý AI', path: '/tro-ly-ai' },
  { icon: Copyright, label: 'Thông tin bản quyền', path: '/ban-quyen' }
];
```

Sidebar render cả 2 danh sách bằng `NavItem`:

```tsx
{sidebarMenu.map((item) => (
  <NavItem key={item.path} item={item} isOpen={isOpen} onClick={() => {
    if (window.innerWidth < 1024) setIsOpen(false);
  }} />
))}
```

### Module data

`moduleData.ts` export object theo key route module. Mỗi route chứa các section, mỗi section chứa items có icon/title/description/colorScheme/path.

Ví dụ item có route con trong module Nhân sự:

```tsx
'/nhan-su': [
  {
    section: 'Tuyển dụng',
    items: [
      { icon: Megaphone, title: 'Tin tuyển dụng', description: 'Đăng tin, vị trí tuyển dụng, yêu cầu.', colorScheme: 'blue' },
      { icon: UserPlus, title: 'Ứng viên', description: 'Quản lý hồ sơ, trạng thái ứng viên.', colorScheme: 'purple', path: '/nhan-su/ung-vien' },
      { icon: Calendar, title: 'Lịch phỏng vấn', description: 'Đặt lịch, phỏng vấn, người vấn.', colorScheme: 'purple' },
    ]
  }
]
```

`Topbar` dùng `moduleData` để tìm label breadcrumb theo `item.path`:

```tsx
for (const mainPath in moduleData) {
  for (const section of moduleData[mainPath]) {
    const found = section.items.find((item: any) => item.path === path);
    if (found) return found.title;
  }
}
```

## 8. Color scheme, spacing, className pattern

### CSS variables và theme

`index.css` khai báo light theme ở `:root`:

```css
:root {
  --font-sans: 'Inter', 'Noto Sans', sans-serif;
  --primary: #3b82f6;
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --border: #e2e8f0;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --accent: #f1f5f9;
  --accent-foreground: #0f172a;
  --ring: #3b82f6;
}
```

Dark theme override bằng class `.dark`:

```css
.dark {
  --background: #020617;
  --foreground: #f8fafc;
  --card: #0f172a;
  --border: #1e293b;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #1e293b;
  --accent-foreground: #f8fafc;
  --ring: #1d4ed8;
}
```

Tailwind theme map sang CSS variables:

```css
@theme {
  --font-sans: var(--font-sans);
  --color-primary: var(--primary);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-border: var(--border);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-ring: var(--ring);
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
}
```

`ThemeContext` quản lý class `light`/`dark` trên `document.documentElement`, có hỗ trợ `system`:

```tsx
useEffect(() => {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');

  if (theme === 'system') {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.classList.add(systemTheme);
  } else {
    root.classList.add(theme);
  }

  localStorage.setItem('theme', theme);
}, [theme]);
```

Theme context cũng đổi primary color, font, font size và avatar qua CSS variables/localStorage:

```tsx
useEffect(() => {
  const root = window.document.documentElement;
  const colorConfig = THEME_COLORS.find(c => c.name === primaryColor) || THEME_COLORS[0];
  root.style.setProperty('--primary', colorConfig.hex);
  root.style.setProperty('--ring', colorConfig.hex);
  localStorage.setItem('primaryColor', primaryColor);
}, [primaryColor]);
```

```tsx
useEffect(() => {
  if (avatar) {
    localStorage.setItem('userAvatar', avatar);
  }
}, [avatar]);
```

### Spacing và layout class thường gặp

Page/layout dùng spacing responsive:

```tsx
<main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6 custom-scrollbar">
```

Dialog body dùng spacing section:

```tsx
<div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
```

Grid form responsive:

```tsx
<div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
```

Button primary:

```tsx
className="flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white text-[13px] font-bold hover:bg-primary/90 shadow-lg shadow-primary/20 transition-all"
```

Badge status/source:

```tsx
className={clsx('px-2.5 py-1 rounded-full text-[10px] font-bold border whitespace-nowrap block text-center', statusConfig[c.status].classes)}
```

Scrollbar custom:

```css
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: 10px;
}
```

Dialog animation:

```css
.dialog-slide-in {
  animation: dialog-slide-in 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.dialog-slide-out {
  animation: dialog-slide-out 300ms ease-in both;
}
```

## 9. Quy ước đặt tên

### File và folder

Pattern hiện có:

```txt
MainLayout.tsx
Sidebar.tsx
Topbar.tsx
MobileBottomNav.tsx
ActionCard.tsx
ModuleCard.tsx
SearchableSelect.tsx
CandidatesPage.tsx
AddEditCandidateDialog.tsx
CandidateDetailDialog.tsx
candidates/data.ts
candidates/types.ts
```

Quy ước rút ra từ code hiện có:

- Component React dùng `PascalCase`: `MainLayout`, `Sidebar`, `Topbar`, `CandidatesPage`, `AddEditCandidateDialog`.
- File component dùng `PascalCase.tsx`.
- Thư mục module dùng lowercase/kebab hoặc domain lowercase: `candidates`.
- File dữ liệu/type dùng lowercase: `data.ts`, `types.ts`.

### Component và props

Component typed bằng `React.FC<Props>` hoặc `React.FC<ComponentProps>`:

```tsx
interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
```

Dialog dùng interface tên `Props` trong file nội bộ:

```tsx
interface Props {
  candidateId: string | null;
  isClosing: boolean;
  onClose: () => void;
  onEdit: () => void;
}
```

Callback props dùng prefix `on`:

```tsx
onClose: () => void;
onEdit: () => void;
onAddDocument: () => void;
onOpenInterviewModal: () => void;
```

State setter props dùng `set...`:

```tsx
setFormField: <K extends keyof CandidateFormState>(key: K, value: CandidateFormState[K]) => void;
```

### Type và data naming

Interface domain dùng `PascalCase`:

```tsx
export interface CandidateDocument { ... }
export interface Candidate { ... }
export interface FilterOption { ... }
export interface InterviewSession { ... }
export interface CandidateFormState { ... }
```

Data/config/options dùng `camelCase` và export const:

```tsx
export const candidatesData: Candidate[] = [ ... ];
export const statusConfig: Record<Candidate['status'], { label: string; classes: string }> = { ... };
export const statusOptions: FilterOption[] = [ ... ];
export const positionOptions: FilterOption[] = [ ... ];
```

### Hàm và biến

Handler trong page dùng động từ rõ nghĩa, thường có prefix `handle`, `open`, `close`, `set`:

```tsx
onEdit={handleEditFromDetail}
onAddDocument={handleAddDocument}
onOpenInterviewModal={openInterviewModal}
onOpenInterviewDetail={openInterviewDetail}
onOpenInterviewEdit={openInterviewEditModal}
```

Trong component, biến derived dùng tên mô tả:

```tsx
const unreadCount = notifications.filter(n => !n.isRead).length;
const displayNotifications = isExpanded ? notifications : notifications.slice(0, 5);
const hasMore = notifications.length > 5;
```

Khi cần class có điều kiện, dùng `clsx` hoặc `cn` theo file hiện có:

```tsx
className={clsx(
  'flex items-center rounded-xl text-sm font-medium transition-all duration-300 overflow-hidden whitespace-nowrap',
  isOpen ? 'px-3 py-2.5 w-full justify-start' : 'w-11 h-11 justify-center',
  isActive
    ? 'bg-primary text-white shadow-sm'
    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
)}
```




## 10. Pattern bảng full-height cho trang danh sách

Các trang dạng danh sách/table phải chiếm hết chiều cao vùng nội dung, kể cả khi dữ liệu ít dòng. Không để card bảng co theo số row rồi bỏ trống phần dưới màn hình.

### Wrapper page

Page con nằm trong `MainLayout` phải dùng wrapper full-height để truyền chiều cao từ `Outlet` xuống card bảng:

```tsx
<div className="h-full min-h-0 flex flex-col space-y-5">
  <Header />
  <TableCard />
</div>
```

### Card bảng

Card chứa filter, table và pagination phải là flex column, có `flex-1 min-h-0`. Filter và pagination dùng `shrink-0`; vùng table dùng `flex-1 min-h-0 overflow-auto` để phần trắng của bảng kéo dài tới đáy màn hình.

```tsx
<div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
  <div className="p-5 border-b border-border bg-muted/5 grid gap-3 shrink-0">
    {/* filters */}
  </div>

  <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
    <table className="w-full min-w-[1180px] text-left">
      {/* rows */}
    </table>
  </div>

  <div className="px-5 py-3 border-t border-border bg-muted/5 flex items-center justify-between shrink-0">
    {/* pagination */}
  </div>
</div>
```

### Loading/error/empty state

Loading, error và empty state cũng phải lấp vùng table để pagination vẫn nằm dưới cùng:

```tsx
function StateBlock() {
  return (
    <div className="flex-1 min-h-[360px] flex flex-col items-center justify-center text-center text-muted-foreground">
      {/* icon, title, description */}
    </div>
  );
}
```

### Pattern giống trang Trucks / Ứng viên

Khi làm trang danh sách nghiệp vụ, phải bám pattern visual của trang Trucks hiện tại. Không diễn giải guideline theo kiểu tự tạo header/search/filter card riêng.

#### Vì sao trang có thể bị lệch dù đã đọc guideline

Các lỗi thường làm giao diện không giống Trucks:

- Tạo **title/header card lớn** trong thân trang (`h1`, mô tả, nút refresh) trong khi breadcrumb/topbar đã có tên trang.
- Tách search/filter thành **card riêng** thay vì đặt chung trong header của table card.
- Dùng button `Bộ lọc` full text trên desktop thay vì filter row compact bằng `FilterSelect`.
- Dùng table card không `flex-1 min-h-0 flex flex-col`, làm empty/table/footer không kéo full chiều cao.
- Dùng empty state dạng dashed box bên trong table thay vì `StateBlock` lấp vùng body.
- Dùng pagination riêng (`Trước/Sau`) thay vì footer compact `1–n/Tổng:n` + page-size + prev/next + current page badge.

#### Contract bắt buộc cho trang danh sách kiểu Trucks

- **Wrapper page**: dùng đúng `h-full min-h-0 flex flex-col gap-2`; không dùng `gap-5`, `space-y-5` nếu không có lý do rõ ràng.
- **Không dùng title block lớn** trong thân trang nếu breadcrumb/topbar đã thể hiện module; không render `h1`, subtitle, module label card hoặc refresh card ở đầu body.
- **Không dùng tab strip `Danh sách/Thống kê`** cho trang danh sách nghiệp vụ mới nếu chưa có nhu cầu chuyển view thật.
- **Chỉ có một table card chính** ngay dưới alert nếu có: `bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col`.
- **Toolbar nằm trong table card**: header card dùng `p-3 border-b border-border bg-card shrink-0 space-y-3`.
- **Toolbar hàng đầu desktop**: `Quay lại` → search `h-10` width khoảng `md/max-w-[460px]` → nút `× Xóa {n} bộ lọc` nếu có → spacer `flex-1` → nút đổi view → primary action `Thêm`/action chính.
- **Filter row desktop**: đặt ngay dưới toolbar trong cùng table card, dùng `hidden md:flex flex-wrap items-center gap-2` và `FilterSelect multiple`; không dùng card filter riêng, không dùng button `Bộ lọc` desktop nếu filter inline đã đủ.
- **Filter button mobile**: chỉ hiện mobile bằng `md:hidden`; desktop dùng filter row inline.
- **Table body**: vùng body dùng `flex-1 min-h-0 overflow-auto custom-scrollbar`; table dùng `hidden md:table w-full min-w-[1180px] text-left border-collapse`.
- **Table grid**: header `bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600`; checkbox column đầu tiên; mọi cell có `border-r border-border` trừ cột cuối; row có `border-b border-border`.
- **Action column**: đặt width/min-width riêng đủ fit button, ví dụ `w-[248px] min-w-[248px]`; không để cột thao tác co hoặc giãn tự do.
- **State block**: loading/error/empty render trực tiếp trong body bằng `StateBlock` có `flex-1 min-h-[360px]`, không bọc trong dashed inner card.
- **Footer pagination**: luôn là child cuối của table card, `shrink-0`, format trái `1–4/Tổng:4`; bên phải gồm page-size select, `/ trang`, prev/next icon buttons, current page badge và tổng pages.

Ví dụ khung chuẩn:

```tsx
<div className="h-full min-h-0 flex flex-col gap-2">
  {actionError && <Alert />}

  <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
    <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="h-10 w-10 md:w-auto md:px-3 rounded-lg border border-border bg-muted/10 flex items-center justify-center">
          <ArrowLeft size={15} />
          <span className="hidden md:inline">Quay lại</span>
        </button>
        <div className="relative min-w-0 flex-1 md:max-w-[460px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <input className="h-10 w-full rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium" placeholder="Tìm kiếm..." />
        </div>
        <button className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary md:hidden"><Filter size={16} /></button>
        {activeFilterCount > 0 && <div className="order-last basis-full md:order-none md:basis-auto"><button className="h-9 md:h-10 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500">× Xóa {activeFilterCount} bộ lọc</button></div>}
        <div className="hidden flex-1 md:block" />
        <button className="hidden h-10 w-10 rounded-lg border border-border bg-card md:flex items-center justify-center"><LayoutGrid size={16} /></button>
        <button className="h-10 w-12 md:w-auto md:px-4 rounded-lg bg-primary text-white font-bold"><Plus size={18} /><span className="hidden md:inline">Thêm</span></button>
      </div>

      <div className="hidden md:flex flex-wrap items-center gap-2">
        <FilterSelect multiple placeholder="Trạng thái" className="w-[140px]" />
        <FilterSelect multiple placeholder="Loại" className="w-[180px]" />
        <FilterSelect multiple placeholder="Bưu cục" className="w-[180px]" />
      </div>
    </div>

    {isLoading || error || items.length === 0 ? <StateBlock /> : (
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        <table className="hidden md:table w-full min-w-[1180px] text-left border-collapse">
          <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
            <tr>{headers.map(header => <th className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}>{header.label}</th>)}</tr>
          </thead>
          <tbody>{items.map(item => <tr className="border-b border-border hover:bg-muted/10">{/* bordered cells */}</tr>)}</tbody>
        </table>
        <div className="grid gap-3 p-3 md:hidden">{/* mobile cards */}</div>
      </div>
    )}

    <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
      {/* 1–n/Tổng:n + page size + prev/next + current page */}
    </div>
  </div>
</div>
```

### FilterSelect compact

Với filter nhỏ trong toolbar kiểu trang Ứng viên, dùng component chung `FilterSelect` thay vì `SearchableSelect` full-width. `FilterSelect` có icon trái, placeholder ngắn, chiều cao `h-9`, bo `rounded-lg`, và chỉ hiện label đã chọn khi filter có giá trị.

```tsx
import { Briefcase, Tag } from 'lucide-react';
import { FilterSelect } from '../components/ui/FilterSelect';

<div className="flex flex-wrap items-center gap-2">
  <FilterSelect value={status} options={statusOptions} onValueChange={setStatus} placeholder="Trạng thái" icon={Tag} className="w-[140px]" />
  <FilterSelect value={position} options={positionOptions} onValueChange={setPosition} placeholder="Vị trí ứng tuyển" icon={Briefcase} className="w-[180px]" />
</div>
```

Không dùng các option label kiểu `Tất cả trạng thái` làm text hiển thị mặc định trên trigger; mặc định phải là placeholder ngắn như `Trạng thái`, `Vị trí ứng tuyển`, `Nguồn`.

#### FilterSelect dropdown behavior

`FilterSelect` phải render giống dropdown filter của trang Ứng viên:

- Trigger đóng: nền `bg-card`, `rounded-lg`, border mảnh, icon trái, label placeholder ngắn.
- Trigger mở hoặc có giá trị: border/ring xanh primary; chevron quay lên khi mở; nút `X` chỉ hiện khi đang có value.
- Popover: rộng khoảng `288px`, bo `rounded-2xl`, shadow rõ, align start dưới trigger.
- Dòng đầu popover là ô search `h-9`, icon search trái, placeholder `Tìm kiếm...`.
- Danh sách option dùng button cao `h-9`; option selected có nền `bg-slate-100`, chữ primary và checkmark bên phải.
- Option value rỗng vẫn nằm trong menu như `Tất cả trạng thái`, nhưng trigger khi chưa chọn vẫn hiển thị placeholder `Trạng thái`.
- Khi toolbar có search bar và đang có bất kỳ filter/search value nào, hiển thị nút `× Xóa {n} bộ lọc` ngay bên phải search bar, trước spacer/action buttons; nút dùng `h-10`, `rounded-lg`, border đỏ nhạt, nền đỏ rất nhạt và chỉ xuất hiện khi `n > 0`.

#### FilterSelect multi-select

Filter nhiều lựa chọn phải dùng `FilterSelect multiple`:

- Trigger hiển thị lựa chọn đầu tiên và badge `+N` khi chọn nhiều.
- Popover có ô search trên cùng, sau đó là hàng `Chọn tất cả` và nút `Xóa chọn`.
- Mỗi option có checkbox bên trái; option được chọn có checkbox xanh và count phụ nếu có.
- Footer popover hiển thị `x / n đã chọn` và nút `Xong` để đóng.
- Không render option rỗng kiểu `Tất cả trạng thái` trong menu multi-select vì đã có hàng `Chọn tất cả`.
- Checkbox của hàng `Chọn tất cả` và checkbox của từng option phải căn cùng lề trái; không để hàng tổng bị lệch so với danh sách bên dưới.
- Khi gửi API, multi filter nên serialize thành comma-list (`status=AVAILABLE,IN_USE`) và backend parse sang mảng để query `IN`.

```tsx
<FilterSelect
  multiple
  value={filters.status}
  options={statusOptions}
  onValueChange={value => updateFilter('status', value)}
  placeholder="Trạng thái"
  icon={Tag}
/>
```

#### Mobile card list + Filter Panel

Trên mobile, không render bảng ngang. Danh sách phải chuyển sang card stack để giống pattern trang Ứng viên:

- Table dùng `hidden md:table`; mobile list dùng `grid gap-3 p-3 md:hidden`.
- Card dùng `rounded-2xl`, border mảnh, shadow nhẹ; header có avatar/icon trái, tiêu đề đậm, checkbox góc phải.
- Badge trạng thái/loại đặt ngay dưới tiêu đề; thông tin phụ gom vào block nền `bg-muted/20`.
- Action buttons đặt cuối card sau separator, căn phải và dùng cùng `IconButton` với desktop.

Khi cần lọc trên mobile hoặc cần filter nâng cao, dùng component bottom sheet `FilterPanel`:

- Trigger là button icon `Filter` trên thanh search/header, có badge số filter đang bật; với layout desktop đã có filter inline thì trigger này phải `md:hidden`.
- Panel dùng overlay mờ phía sau, trượt lên từ dưới, bo góc trên lớn, giới hạn `max-h` theo viewport và để vùng nội dung scroll nếu filter quá dài.
- Header panel gồm tiêu đề `Bộ lọc`, badge count và nút `X` đóng.
- Mỗi nhóm filter là accordion collapse/expand; bên trong có ô search, hàng `Chọn tất cả` + `Xóa chọn`, rồi danh sách checkbox. Checkbox của `Chọn tất cả` phải thẳng hàng với checkbox option bên dưới.
- Footer cố định dưới panel có nút `Áp dụng` full-width màu primary; nếu có nút xóa thì đặt bên trái và vẫn giữ `Áp dụng` là action chính.
- Mobile toolbar phải giữ hàng đầu gọn như mẫu: back icon vuông, search flex-1, filter icon có badge, nút thêm chỉ còn icon `+`; ẩn nút đổi view bằng `hidden md:flex`.
- Nút `× Xóa {n} bộ lọc` trên mobile không chen ngang hàng search/action; đặt xuống dòng riêng bằng `order-last basis-full`, còn desktop giữ inline bên phải search bar.







## 11. Trang chuẩn tham chiếu — AdminTrucksPage

Đây là trang chuẩn cho mọi trang danh sách trong dự án ECO.
Mọi trang danh sách mới PHẢI clone cấu trúc JSX của trang này,
không được tự sáng tạo layout khác.

Nguồn tham chiếu hiện tại: `client/src/pages/admin/AdminTrucksPage.tsx`.

### Anti-pattern — KHÔNG làm

1. Không tạo header/hero/stat cards riêng phía trên bảng nếu trang là danh sách quản trị thuần; `AdminTrucksPage` dùng một card lớn chứa toolbar, filter, table, footer.
2. Không bỏ wrapper `h-full min-h-0 flex flex-col gap-2`; thiếu `min-h-0` sẽ làm bảng/footer vỡ chiều cao khi loading hoặc dữ liệu dài.
3. Không render table trên mobile; desktop phải dùng `hidden md:table`, mobile phải dùng card stack `grid gap-3 p-3 md:hidden`.
4. Không hardcode checkbox chỉ để trang trí; checkbox phải có controlled state, disabled đúng điều kiện nghiệp vụ, có chọn tất cả và bulk action rõ ràng.
5. Không render cột bằng thứ tự tĩnh sau khi có ColumnSettings; header và body phải dùng cùng `orderedVisibleHeaders`/renderer để ẩn-hiện và drag reorder không lệch dữ liệu.

### Cấu trúc JSX bắt buộc

Clone skeleton này cho mọi trang danh sách mới, rồi thay placeholder theo domain. Không đổi thứ tự khối layout nếu không có lý do sản phẩm rõ ràng.

```tsx
return (
  <div className="h-full min-h-0 flex flex-col gap-2">
    {actionError && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-[13px] font-medium flex items-center gap-2 shrink-0">
        <AlertTriangle size={16} />
        {actionError}
      </div>
    )}

    <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
      <div className="p-3 border-b border-border bg-card shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="h-10 w-10 shrink-0 rounded-lg border border-border bg-muted/10 text-[13px] font-medium text-muted-foreground hover:bg-muted flex items-center justify-center gap-2 md:w-auto md:px-3"
          >
            <ArrowLeft size={15} />
            <span className="hidden md:inline">Quay lại</span>
          </button>

          <div className="relative min-w-0 flex-1 md:max-w-[460px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={filters.keyword}
              onChange={event => updateFilter('keyword', event.target.value)}
              placeholder="Tìm kiếm..."
              className="w-full h-10 rounded-lg border border-border bg-muted/10 pl-9 pr-3 text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <button
            title="Mở bộ lọc"
            onClick={() => setIsFilterPanelOpen(true)}
            className="relative h-10 w-10 rounded-lg border border-primary/30 bg-blue-50 text-primary hover:bg-blue-100 flex items-center justify-center md:hidden"
          >
            <Filter size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>

          {activeFilterCount > 0 && (
            <div className="order-last basis-full md:order-none md:basis-auto">
              <button
                onClick={clearFilters}
                className="h-9 rounded-lg border border-red-200 bg-red-50 px-3 text-[13px] font-bold text-red-500 transition-colors hover:bg-red-100 md:h-10"
              >
                × Xóa {activeFilterCount} bộ lọc
              </button>
            </div>
          )}

          <div className="hidden flex-1 md:block" />

          <ColumnSettings
            columns={tableHeaders}
            columnOrder={columnOrder}
            visibleColumns={visibleColumns}
            onToggle={toggleColumn}
            onReorder={reorderColumn}
          />

          {canManage && (
            <button
              onClick={openAdd}
              className="h-10 w-12 shrink-0 rounded-lg bg-primary text-white text-[14px] font-bold shadow-sm shadow-primary/20 flex items-center justify-center gap-2 md:w-auto md:px-4"
            >
              <Plus size={18} />
              <span className="hidden md:inline">Thêm</span>
            </button>
          )}
        </div>

        <div className="hidden md:flex flex-wrap items-center gap-2">
          <FilterSelect
            multiple
            value={filters.status}
            options={statusOptions}
            onValueChange={value => updateFilter('status', value)}
            placeholder="Trạng thái"
            icon={Tag}
            className="w-[140px]"
          />
          <FilterSelect
            multiple
            value={filters.type}
            options={typeOptions}
            onValueChange={value => updateFilter('type', value)}
            placeholder="Phân loại"
            icon={Briefcase}
            className="w-[180px]"
          />
          <FilterSelect
            multiple
            value={filters.hub_id}
            options={hubOptions}
            onValueChange={value => updateFilter('hub_id', value)}
            placeholder="Bưu cục"
            icon={Filter}
            className="w-[180px]"
          />
        </div>
      </div>

      {isLoading ? (
        <StateBlock
          icon={<Loader2 className="animate-spin" size={24} />}
          title="Đang tải danh sách"
          description="Hệ thống đang gọi API danh sách."
        />
      ) : error ? (
        <StateBlock
          icon={<AlertTriangle size={24} />}
          title="Không tải được dữ liệu"
          description={error}
        />
      ) : items.length === 0 ? (
        <StateBlock
          icon={<EntityIcon size={24} />}
          title="Chưa có dữ liệu phù hợp"
          description="Thử đổi bộ lọc hoặc tạo bản ghi mới nếu bạn có quyền quản lý."
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
          {canDelete && selectedBulkDeleteCount > 0 && (
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-[13px] font-bold text-primary">
              <span>Đã chọn {selectedBulkDeleteCount} bản ghi để xóa</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={clearSelection}
                  className="h-8 rounded-lg border border-border bg-white px-3 text-[12px] text-muted-foreground hover:bg-muted"
                >
                  Bỏ chọn
                </button>
                <button
                  disabled={isSubmitting}
                  onClick={() => void confirmBulkDelete()}
                  className="h-8 rounded-lg bg-red-600 px-3 text-[12px] text-white hover:bg-red-700 disabled:opacity-60"
                >
                  Xóa đã chọn
                </button>
              </div>
            </div>
          )}

          <table className="hidden md:table w-full min-w-[1180px] text-left border-collapse">
            <thead className="bg-slate-100 text-[11px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className="w-11 px-4 py-2.5 border-r border-border">
                  <input
                    type="checkbox"
                    checked={isAllVisibleSelected}
                    disabled={!bulkDeletableIds.length}
                    onChange={toggleAllVisibleItems}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                {orderedVisibleHeaders.map(header => (
                  <th
                    key={header.id}
                    className={clsx('px-4 py-2.5 font-bold border-r border-border last:border-r-0', header.className)}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {items.map(item => {
                const itemId = normalizeId(item.id);
                const canSelectItem = canDelete && canBulkDelete(item);

                return (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 border-r border-border">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(itemId)}
                        disabled={!canSelectItem}
                        onChange={() => toggleSelection(itemId)}
                        className="h-4 w-4 rounded border-border disabled:opacity-40"
                      />
                    </td>
                    {orderedVisibleHeaders.map(header => renderTableCell(header.id, item))}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid gap-3 p-3 md:hidden">
            {items.map(item => (
              <MobileEntityCard
                key={item.id}
                item={item}
                canManage={canManage}
                canDelete={canDelete}
                isSelected={selectedIds.includes(normalizeId(item.id))}
                canSelect={canDelete && canBulkDelete(item)}
                onToggleSelect={() => toggleSelection(normalizeId(item.id))}
                openDetail={openDetail}
                openEdit={openEdit}
                confirmDelete={confirmDelete}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-muted-foreground shrink-0">
        <span>
          <b className="text-foreground font-medium">
            {(filters.page - 1) * filters.limit + (items.length ? 1 : 0)}–{(filters.page - 1) * filters.limit + items.length}
          </b>
          /Tổng:{total}
        </span>

        <div className="flex items-center gap-2">
          <select
            value={filters.limit}
            onChange={event => updateFilter('limit', Number(event.target.value))}
            className="h-8 rounded border border-border bg-card px-2 text-[12px] focus:outline-none"
          >
            {[10, 20, 50].map(limit => (
              <option key={limit} value={limit}>{limit}</option>
            ))}
          </select>
          <span>/ trang</span>
          <button
            disabled={filters.page <= 1}
            onClick={() => updateFilter('page', filters.page - 1)}
            className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
          >
            <ChevronLeft size={15} />
          </button>
          <button
            disabled={filters.page >= totalPages}
            onClick={() => updateFilter('page', filters.page + 1)}
            className="p-2 rounded-lg border border-border bg-card disabled:opacity-40 hover:bg-muted"
          >
            <ChevronRight size={15} />
          </button>
          <span className="h-8 px-2 rounded bg-primary text-white text-[12px] font-bold flex items-center">
            {filters.page}
          </span>
          <span>/</span>
          <span className="text-foreground">{totalPages}</span>
        </div>
      </div>
    </div>

    <AddEditEntityDialog
      isOpen={isFormOpen}
      isClosing={isFormClosing}
      isEditMode={isEditMode}
      isSubmitting={isSubmitting}
      onClose={closeForm}
      onSubmit={submitForm}
      formState={formState}
      setFormField={setFormField}
    />

    <EntityDetailDialog
      item={detailItem}
      isClosing={isDetailClosing}
      canManage={canManage}
      onClose={closeDetail}
      onEdit={() => {
        if (detailItem) {
          closeDetail();
          openEdit(detailItem);
        }
      }}
    />

    <FilterPanel
      open={isFilterPanelOpen}
      activeCount={activeFilterCount}
      groups={filterPanelGroups}
      onClose={() => setIsFilterPanelOpen(false)}
      onApply={() => setIsFilterPanelOpen(false)}
      onClear={clearFilters}
    />
  </div>
);
```
