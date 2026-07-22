export type SearchResultType = 'WAYBILL' | 'TRIP';

export class SearchResultEntity {
  id: string;
  type: SearchResultType;
  code: string;
  title: string;
  subtitle: string;
  status: string;
  hub_summary: string;
  created_at?: Date;
  departure_time?: Date;
  matched_fields: string[];
  customer_code?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  goods_content?: string | null;
}
