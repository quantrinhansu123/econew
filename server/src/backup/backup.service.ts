import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupImportMode,
  type BackupTableMeta,
  type BackupTablePayload,
  type SupabaseTableBackup,
} from './backup.types';

const EXCLUDED_TABLES = new Set([
  'migrations',
  'spatial_ref_sys',
  'geography_columns',
  'geometry_columns',
  'raster_columns',
  'raster_overviews',
]);

const MAX_EXPORT_ROWS = 200_000;
const BATCH_SIZE = 200;

const quoteIdent = (value: string) => `"${value.replace(/"/g, '""')}"`;

@Injectable()
export class BackupService {
  constructor(private readonly dataSource: DataSource) {}

  async listTables(): Promise<BackupTableMeta[]> {
    const tables = await this.dataSource.query(`
      SELECT c.relname AS name,
             COALESCE(s.n_live_tup, 0)::bigint AS row_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
      ORDER BY c.relname
    `) as Array<{ name: string; row_count: string | number }>;

    const result: BackupTableMeta[] = [];
    for (const table of tables) {
      if (EXCLUDED_TABLES.has(table.name) || table.name.startsWith('_')) continue;
      const primaryKey = await this.getPrimaryKey(table.name);
      result.push({
        name: table.name,
        row_count: Number(table.row_count) || 0,
        primary_key: primaryKey,
      });
    }
    return result;
  }

  async exportTables(tableNames: string[]): Promise<SupabaseTableBackup> {
    const uniqueNames = [...new Set(tableNames.map((name) => name.trim()).filter(Boolean))];
    if (!uniqueNames.length) {
      throw new BadRequestException('Chọn ít nhất một bảng để backup.');
    }

    const allowed = new Set((await this.listTables()).map((table) => table.name));
    const invalid = uniqueNames.filter((name) => !allowed.has(name));
    if (invalid.length) {
      throw new BadRequestException(`Bảng không hợp lệ: ${invalid.join(', ')}`);
    }

    const ordered = await this.orderByDependencies(uniqueNames);
    const tables: BackupTablePayload[] = [];
    let totalRows = 0;

    for (const name of ordered) {
      const columns = await this.getColumns(name);
      const primaryKey = await this.getPrimaryKey(name);
      const rows = await this.dataSource.query(
        `SELECT * FROM public.${quoteIdent(name)} ORDER BY ${primaryKey.length ? primaryKey.map(quoteIdent).join(', ') : '1'}`,
      ) as Record<string, unknown>[];

      totalRows += rows.length;
      if (totalRows > MAX_EXPORT_ROWS) {
        throw new PayloadTooLargeException(
          `Backup vượt quá ${MAX_EXPORT_ROWS.toLocaleString('vi-VN')} dòng. Hãy chọn ít bảng hơn.`,
        );
      }

      tables.push({
        name,
        primary_key: primaryKey,
        columns,
        rows: rows.map((row) => this.serializeRow(row, columns)),
      });
    }

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      source: 'eco-transport',
      schema: 'public',
      exported_at: new Date().toISOString(),
      tables,
    };
  }

  async importBackup(
    payload: Partial<SupabaseTableBackup> & { mode?: BackupImportMode },
  ): Promise<{ imported_tables: string[]; inserted: number; updated: number; skipped: number }> {
    if (payload.format !== BACKUP_FORMAT) {
      throw new BadRequestException(`Định dạng backup không hỗ trợ. Cần format="${BACKUP_FORMAT}".`);
    }
    if (Number(payload.version) !== BACKUP_VERSION) {
      throw new BadRequestException(`Phiên bản backup không hỗ trợ. Cần version=${BACKUP_VERSION}.`);
    }
    if (!payload.tables?.length) {
      throw new BadRequestException('File backup không có bảng nào.');
    }

    const mode: BackupImportMode = payload.mode ?? 'upsert';
    const allowed = new Set((await this.listTables()).map((table) => table.name));
    const tableNames = payload.tables.map((table) => table.name);
    const invalid = tableNames.filter((name) => !allowed.has(name));
    if (invalid.length) {
      throw new BadRequestException(`Bảng không tồn tại trên DB: ${invalid.join(', ')}`);
    }

    const ordered = await this.orderByDependencies(tableNames);
    const byName = new Map(payload.tables.map((table) => [table.name, table]));

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    await this.dataSource.transaction(async (manager) => {
      if (mode === 'replace') {
        for (const name of [...ordered].reverse()) {
          await manager.query(`DELETE FROM public.${quoteIdent(name)}`);
        }
      }

      for (const name of ordered) {
        const table = byName.get(name);
        if (!table) continue;

        const liveColumns = await this.getColumns(name);
        const liveColumnSet = new Set(liveColumns);
        const columns = table.columns.filter((column) => liveColumnSet.has(column));
        if (!columns.length) {
          throw new BadRequestException(`Bảng ${name} không có cột khớp với DB hiện tại.`);
        }

        const primaryKey = table.primary_key.filter((column) => liveColumnSet.has(column));
        const rows = table.rows || [];

        for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
          const batch = rows.slice(offset, offset + BATCH_SIZE);
          for (const row of batch) {
            const values = columns.map((column) => this.deserializeValue(row[column]));
            const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
            const columnSql = columns.map(quoteIdent).join(', ');

            if (mode === 'insert_only' || !primaryKey.length) {
              try {
                await manager.query(
                  `INSERT INTO public.${quoteIdent(name)} (${columnSql}) VALUES (${placeholders})`,
                  values,
                );
                inserted += 1;
              } catch (error) {
                if (mode === 'insert_only') {
                  skipped += 1;
                  continue;
                }
                throw error;
              }
              continue;
            }

            const updateSet = columns
              .filter((column) => !primaryKey.includes(column))
              .map((column) => `${quoteIdent(column)} = EXCLUDED.${quoteIdent(column)}`)
              .join(', ');

            const conflictTarget = primaryKey.map(quoteIdent).join(', ');
            if (!updateSet) {
              const result = await manager.query(
                `INSERT INTO public.${quoteIdent(name)} (${columnSql}) VALUES (${placeholders})
                 ON CONFLICT (${conflictTarget}) DO NOTHING
                 RETURNING xmax`,
                values,
              );
              if (Array.isArray(result) && result.length) inserted += 1;
              else skipped += 1;
              continue;
            }

            const result = await manager.query(
              `INSERT INTO public.${quoteIdent(name)} (${columnSql}) VALUES (${placeholders})
               ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}
               RETURNING (xmax = 0) AS inserted`,
              values,
            );

            if (Array.isArray(result) && result[0]?.inserted === true) inserted += 1;
            else updated += 1;
          }
        }
      }
    });

    return { imported_tables: ordered, inserted, updated, skipped };
  }

  private async getColumns(tableName: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
      `,
      [tableName],
    ) as Array<{ column_name: string }>;
    return rows.map((row) => row.column_name);
  }

  private async getPrimaryKey(tableName: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      `,
      [tableName],
    ) as Array<{ column_name: string }>;
    return rows.map((row) => row.column_name);
  }

  private async orderByDependencies(tableNames: string[]): Promise<string[]> {
    const nameSet = new Set(tableNames);
    const edges = await this.dataSource.query(
      `
      SELECT
        tc.table_name AS child,
        ccu.table_name AS parent
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
      `,
    ) as Array<{ child: string; parent: string }>;

    const indegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    for (const name of tableNames) {
      indegree.set(name, 0);
      graph.set(name, []);
    }

    for (const edge of edges) {
      if (!nameSet.has(edge.child) || !nameSet.has(edge.parent) || edge.child === edge.parent) continue;
      graph.get(edge.parent)?.push(edge.child);
      indegree.set(edge.child, (indegree.get(edge.child) || 0) + 1);
    }

    const queue = tableNames.filter((name) => (indegree.get(name) || 0) === 0).sort();
    const ordered: string[] = [];

    while (queue.length) {
      const current = queue.shift()!;
      ordered.push(current);
      for (const next of graph.get(current) || []) {
        const nextDegree = (indegree.get(next) || 0) - 1;
        indegree.set(next, nextDegree);
        if (nextDegree === 0) queue.push(next);
      }
      queue.sort();
    }

    if (ordered.length !== tableNames.length) {
      // Cycle / unresolved: keep stable alphabetical fallback for remaining.
      for (const name of [...tableNames].sort()) {
        if (!ordered.includes(name)) ordered.push(name);
      }
    }

    return ordered;
  }

  private serializeRow(row: Record<string, unknown>, columns: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const column of columns) {
      const value = row[column];
      if (value instanceof Date) {
        result[column] = value.toISOString();
      } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
        result[column] = value.toString('base64');
      } else {
        result[column] = value ?? null;
      }
    }
    return result;
  }

  private deserializeValue(value: unknown): unknown {
    return value === undefined ? null : value;
  }
}
