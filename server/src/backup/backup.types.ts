export const BACKUP_FORMAT = 'supabase-table-backup' as const;
export const BACKUP_VERSION = 1 as const;

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
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  source: 'eco-transport';
  schema: 'public';
  exported_at: string;
  tables: BackupTablePayload[];
};
