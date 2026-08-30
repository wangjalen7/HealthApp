import * as SQLite from 'expo-sqlite';

import { vitalSources, type VitalSample, type VitalSource } from '../../domain/vitals';

type OutboxRecord = { id: string; operation: 'upsert_vitals'; payload: string; attempts: number };

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database() {
  databasePromise ??= SQLite.openDatabaseAsync('healthapp.db').then(async (db) => {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS vital_samples (
        id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
        value REAL NOT NULL, unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
        correlation_id TEXT, source TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT
      );
      CREATE INDEX IF NOT EXISTS vital_samples_user_date ON vital_samples(user_id, occurred_at DESC);
      CREATE TABLE IF NOT EXISTS outbox (
        id TEXT PRIMARY KEY NOT NULL, operation TEXT NOT NULL, payload TEXT NOT NULL,
        created_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT
      );
      CREATE TABLE IF NOT EXISTS app_metadata (
        key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL
      );
    `);
    return db;
  });
  return databasePromise;
}

const readSource = (value: unknown): VitalSource => vitalSources.includes(value as VitalSource) ? value as VitalSource : 'manual';
const toSample = (row: Record<string, unknown>): VitalSample => ({
  id: String(row.id), userId: String(row.user_id), kind: row.kind as VitalSample['kind'], value: Number(row.value),
  unit: String(row.unit), occurredAt: String(row.occurred_at), correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
  source: readSource(row.source), createdAt: String(row.created_at), deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
});

export async function cachedVitals(userId: string): Promise<VitalSample[]> {
  const db = await database();
  const rows = await db.getAllAsync<Record<string, unknown>>('SELECT * FROM vital_samples WHERE user_id = ? ORDER BY occurred_at DESC', [userId]);
  return rows.map(toSample);
}

export async function saveCachedVitals(samples: VitalSample[]): Promise<void> {
  if (samples.length === 0) return;
  const db = await database();
  await db.withTransactionAsync(async () => {
    for (const sample of samples) {
      await db.runAsync(`INSERT INTO vital_samples (id, user_id, kind, value, unit, occurred_at, correlation_id, source, created_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, occurred_at = excluded.occurred_at, deleted_at = excluded.deleted_at`,
      [sample.id, sample.userId, sample.kind, sample.value, sample.unit, sample.occurredAt, sample.correlationId ?? null, sample.source, sample.createdAt, sample.deletedAt ?? null]);
    }
  });
}

export async function enqueueVitals(samples: VitalSample[]): Promise<void> {
  const db = await database();
  await db.runAsync('INSERT INTO outbox (id, operation, payload, created_at) VALUES (?, ?, ?, ?)', [createId(), 'upsert_vitals', JSON.stringify(samples), new Date().toISOString()]);
}

export async function queuedChanges(): Promise<OutboxRecord[]> {
  const db = await database();
  return db.getAllAsync<OutboxRecord>('SELECT id, operation, payload, attempts FROM outbox ORDER BY created_at ASC');
}

export async function completeChange(id: string): Promise<void> {
  const db = await database();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]);
}

export async function failChange(id: string, error: string): Promise<void> {
  const db = await database();
  await db.runAsync('UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?', [error.slice(0, 300), id]);
}

const syncKey = (userId: string) => `vitals:last-sync:${userId}`;
export async function lastVitalSyncAt(userId: string): Promise<string | undefined> {
  const db = await database(); const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', [syncKey(userId)]);
  return row?.value;
}
export async function saveVitalSyncAt(userId: string, value: string): Promise<void> {
  const db = await database(); await db.runAsync('INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [syncKey(userId), value]);
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
