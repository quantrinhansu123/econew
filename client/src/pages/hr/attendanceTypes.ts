export type AttendanceMethod = 'gps' | 'ip';

export type AttendanceLocation = {
  id: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  verification_method: AttendanceMethod;
  allowed_ips?: string[];
  is_active: boolean;
  created_at: string;
};

export type AttendanceLog = {
  id: string;
  type: 'check_in' | 'check_out';
  status: 'success' | 'failed';
  user_latitude?: number | null;
  user_longitude?: number | null;
  distance_meters: number | null;
  accuracy: number | null;
  accuracy_warning: boolean;
  source_ip: string | null;
  verification_method: AttendanceMethod | null;
  failure_reason: string | null;
  created_at: string;
  user?: { id: string; username: string; full_name: string };
  location?: AttendanceLocation | null;
};

export type AttendanceNetworkStatus = {
  ip: string | null;
  is_public: boolean;
  matched_location: { id: string; name: string } | null;
  gps_available: boolean;
};

export type AttendanceCheckResponse = {
  success: boolean;
  message: string;
  accuracy_warning: boolean;
  distance_meters: number | null;
  verification_method: AttendanceMethod;
  location: AttendanceLocation;
};
