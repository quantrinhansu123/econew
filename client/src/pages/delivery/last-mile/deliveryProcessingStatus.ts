export type DeliveryAssignmentType = 'INTERNAL' | 'PARTNER' | 'TECHNOLOGY' | 'CUSTOMER_PICKUP';

export type DeliveryProcessingTone = 'slate' | 'blue' | 'violet' | 'amber' | 'emerald' | 'red';

export interface DeliveryProcessingSource {
  current_state?: string | null;
  status?: string | null;
  delivery_preparation_status?: string | null;
  delivery_scheduled_at?: string | Date | null;
  delivery_hold_reason?: string | null;
  delivery_preparation_note?: string | null;
  delivery_assignment_type?: DeliveryAssignmentType | null;
  route_code?: string | null;
  last_mile_driver_name?: string | null;
  last_mile_license_plate?: string | null;
  last_mile_driver?: { name?: string | null; full_name?: string | null; username?: string | null } | null;
  last_mile_vendor?: { name?: string | null; code?: string | null } | null;
  last_delivery_failure_reason?: string | null;
  delivery_dispatch?: { kind: 'PLAN' | 'ASSIGNMENT'; assignment_type: string; route_code: string | null; driver_name: string | null; license_plate: string | null; vendor_name: string | null; scheduled_at: string | null; note: string | null } | null;
}

export interface DeliveryProcessingPresentation {
  title: string;
  detail: string;
  note: string;
  tone: DeliveryProcessingTone;
}

const compact = (value: unknown) => String(value ?? '').trim();

const formatScheduledAt = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('vi-VN');
};

const assignmentTitle = (type?: DeliveryAssignmentType | null) => {
  if (type === 'INTERNAL') return 'Đã điều phối · xe nội bộ';
  if (type === 'PARTNER') return 'Đã điều phối · xe đối tác';
  if (type === 'TECHNOLOGY') return 'Đã điều phối · xe công nghệ';
  if (type === 'CUSTOMER_PICKUP') return 'Sẵn sàng giao · khách tới lấy';
  return 'Đang giao chặng cuối';
};

const assignmentDetail = (source: DeliveryProcessingSource) => {
  const driver = compact(
    source.last_mile_driver_name
      || source.last_mile_driver?.name
      || source.last_mile_driver?.full_name
      || source.last_mile_driver?.username,
  );
  const vendor = compact(source.last_mile_vendor?.name || source.last_mile_vendor?.code);
  return [
    compact(source.route_code) ? `Tuyến ${compact(source.route_code)}` : '',
    source.delivery_assignment_type === 'PARTNER' || source.delivery_assignment_type === 'TECHNOLOGY'
      ? vendor || driver
      : driver,
    compact(source.last_mile_license_plate),
  ].filter(Boolean).join(' · ');
};

export function resolveDeliveryProcessingStatus(source: DeliveryProcessingSource): DeliveryProcessingPresentation {
  const currentState = compact(source.current_state || source.status).toUpperCase();
  const preparation = compact(source.delivery_preparation_status || 'PENDING_CONFIRMATION').toUpperCase();
  const assignmentType = source.delivery_assignment_type ?? null;
  const note = [...new Set([compact(source.delivery_preparation_note), compact(source.delivery_dispatch?.note)].filter(Boolean))].join(' · ');

  if (currentState === 'DELIVERED') {
    return {
      title: 'Phát thành công',
      detail: assignmentType === 'CUSTOMER_PICKUP' ? 'Khách đã tới HUB lấy hàng' : assignmentTitle(assignmentType),
      note,
      tone: 'emerald',
    };
  }

  if (currentState === 'RETURNED') {
    return {
      title: 'Giao không thành công',
      detail: compact(source.last_delivery_failure_reason),
      note,
      tone: 'red',
    };
  }

  if (currentState === 'OUT_FOR_DELIVERY') {
    return {
      title: assignmentTitle(assignmentType),
      detail: assignmentDetail(source),
      note,
      tone: assignmentType === 'CUSTOMER_PICKUP' ? 'violet' : 'blue',
    };
  }

  if (source.delivery_dispatch?.kind === 'PLAN') {
    const plan = source.delivery_dispatch;
    return { title: preparation === 'HOLD' ? 'Kế hoạch · chờ xử lý' : preparation === 'SCHEDULED' ? 'Kế hoạch · hẹn ngày giao' : preparation === 'NEEDS_ACTION' ? 'Kế hoạch · cần xử lý' : 'Đã lập kế hoạch · chưa bàn giao',
      detail: [preparation === 'HOLD' ? compact(source.delivery_hold_reason) : preparation === 'SCHEDULED' || preparation === 'NEEDS_ACTION' ? formatScheduledAt(source.delivery_scheduled_at) : '',
        plan.route_code ? `Tuyến ${plan.route_code}` : '', plan.vendor_name || plan.driver_name, plan.license_plate, formatScheduledAt(plan.scheduled_at)].filter(Boolean).join(' · '),
      note, tone: preparation === 'HOLD' || preparation === 'SCHEDULED' ? 'amber' : preparation === 'NEEDS_ACTION' ? 'red' : 'violet' };
  }

  if (preparation === 'READY') {
    return {
      title: assignmentType === 'CUSTOMER_PICKUP'
        ? 'Sẵn sàng giao · khách tới lấy'
        : 'Sẵn sàng giao · điều phối xe',
      detail: assignmentType === 'CUSTOMER_PICKUP' ? 'Không cần điều phối xe' : '',
      note,
      tone: assignmentType === 'CUSTOMER_PICKUP' ? 'violet' : 'emerald',
    };
  }

  if (preparation === 'SCHEDULED') {
    return {
      title: 'Lưu kho · hẹn ngày giao',
      detail: formatScheduledAt(source.delivery_scheduled_at),
      note,
      tone: 'amber',
    };
  }

  if (preparation === 'HOLD') {
    return {
      title: 'Lưu kho chờ xử lý',
      detail: compact(source.delivery_hold_reason),
      note,
      tone: 'amber',
    };
  }

  if (preparation === 'NEEDS_ACTION') {
    return {
      title: 'Đến hẹn · cần xử lý',
      detail: formatScheduledAt(source.delivery_scheduled_at),
      note,
      tone: 'red',
    };
  }

  return {
    title: currentState === 'IN_TRANSIT' ? 'Chờ gọi xác nhận' : 'Chờ xác nhận / xử lý',
    detail: '',
    note,
    tone: currentState === 'IN_TRANSIT' ? 'blue' : 'slate',
  };
}

export function resolveDeliveryProcessingText(source: DeliveryProcessingSource): string {
  const presentation = resolveDeliveryProcessingStatus(source);
  return [presentation.title, presentation.detail, presentation.note].filter(Boolean).join(' · ');
}
