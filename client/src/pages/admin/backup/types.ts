export type BackupImportMode = 'upsert' | 'insert_only' | 'replace';

export type BackupTableMeta = {
  name: string;
  row_count: number;
  primary_key: string[];
};

export type BackupTablePayload = {
  name: string;
  primary_key: string[];
  columns: string[];
  rows: Record<string, unknown>[];
};

export type SupabaseTableBackup = {
  format: 'supabase-table-backup';
  version: number;
  source?: string;
  schema?: string;
  exported_at?: string;
  tables: BackupTablePayload[];
  mode?: BackupImportMode;
};

export type BackupImportResult = {
  imported_tables: string[];
  inserted: number;
  updated: number;
  skipped: number;
};
