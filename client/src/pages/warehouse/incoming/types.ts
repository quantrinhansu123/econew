export interface IncomingHub {
  id?: string | number | null;
  code?: string | null;
  name?: string | null;
}

export interface IncomingManifest {
  id?: string | number | null;
  manifest_code?: string | null;
  seal_code?: string | null;
  origin_hub_id?: string | number | null;
  dest_hub_id?: string | number | null;
  origin_hub?: IncomingHub | null;
  dest_hub?: IncomingHub | null;
  waybill_count?: number | null;
  total_waybills?: number | null;
  total_weight?: number | string | null;
  total_volumetric_weight?: number | string | null;
  total_m3?: number | string | null;
}

export interface IncomingTrip {
  id: string | number;
  manifest_id?: string | number | null;
  manifest_code?: string | null;
  seal_code?: string | null;
  origin_hub_id?: string | number | null;
  start_hub_id?: string | number | null;
  end_hub_id?: string | number | null;
  origin_hub?: IncomingHub | null;
  start_hub?: IncomingHub | null;
  end_hub?: IncomingHub | null;
  dest_hub?: IncomingHub | null;
  departure_time?: string | null;
  arrival_time?: string | null;
  expected_arrival_time?: string | null;
  estimated_arrival_time?: string | null;
  status?: string | null;
  manifest?: IncomingManifest | null;
  waybill_count?: number | null;
  total_waybills?: number | null;
  total_weight?: number | string | null;
  planned_total_weight?: number | string | null;
  total_volumetric_weight?: number | string | null;
  total_m3?: number | string | null;
  planned_total_volume?: number | string | null;
  license_plate?: string | null;
  driver_name?: string | null;
  driver_phone?: string | null;
  vendor_name?: string | null;
  vehicle_type?: string | null;
  truck?: {
    license_plate?: string | null;
    bks?: string | null;
    ten_lai_xe?: string | null;
    loai_xe?: string | null;
    nha_xe?: string | null;
    vendor?: { name?: string | null } | null;
    driver?: { name?: string | null; phone?: string | null } | null;
  } | null;
}

export interface IncomingTripListResponse {
  data?: IncomingTrip[];
  items?: IncomingTrip[];
  trips?: IncomingTrip[];
  total?: number;
  meta?: { total?: number };
}
