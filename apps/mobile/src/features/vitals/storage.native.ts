import * as SQLite from "expo-sqlite";
import { sqliteVitalTransactions, vitalStateSchema } from "./sqlite-store";
import {
  createVitalStorage,
  emptyVitalState,
  enqueueInto,
} from "./store-model";

import {
  vitalSources,
  type VitalSample,
  type VitalSource,
} from "../../domain/vitals";
import { createUuid } from "../../lib/id";

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database() {
  databasePromise ??= SQLite.openDatabaseAsync("healthapp.db").then(
    async (db) => {
      await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS vital_samples (
        id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
        value REAL NOT NULL, unit TEXT NOT NULL, occurred_at TEXT NOT NULL,
        correlation_id TEXT, source TEXT NOT NULL, external_id TEXT, source_name TEXT,
        created_at TEXT NOT NULL, deleted_at TEXT
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
      const columns = await db.getAllAsync<{ name: string }>(
        "PRAGMA table_info(vital_samples)",
      );
      const columnNames = new Set(columns.map((column) => column.name));
      if (!columnNames.has("external_id"))
        await db.execAsync(
          "ALTER TABLE vital_samples ADD COLUMN external_id TEXT",
        );
      if (!columnNames.has("source_name"))
        await db.execAsync(
          "ALTER TABLE vital_samples ADD COLUMN source_name TEXT",
        );
      await db.execAsync(vitalStateSchema);
      return db;
    },
  );
  return databasePromise;
}

const readSource = (value: unknown): VitalSource =>
  vitalSources.includes(value as VitalSource)
    ? (value as VitalSource)
    : "manual";
const toSample = (row: Record<string, unknown>): VitalSample => ({
  id: String(row.id),
  userId: String(row.user_id),
  kind: row.kind as VitalSample["kind"],
  value: Number(row.value),
  unit: String(row.unit),
  occurredAt: String(row.occurred_at),
  correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
  source: readSource(row.source),
  externalId: row.external_id ? String(row.external_id) : undefined,
  sourceName: row.source_name ? String(row.source_name) : undefined,
  createdAt: String(row.created_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
});

const transact = sqliteVitalTransactions(database, async (user, tx) => {
  const state = emptyVitalState();
  const rows = await tx.getFirstAsync<{ payload: string }>(
    "SELECT json_group_array(json_object('id',id,'user_id',user_id,'kind',kind,'value',value,'unit',unit,'occurred_at',occurred_at,'correlation_id',correlation_id,'source',source,'external_id',external_id,'source_name',source_name,'created_at',created_at,'deleted_at',deleted_at)) payload FROM vital_samples WHERE user_id=?",
    [user],
  );
  for (const row of JSON.parse(rows?.payload ?? "[]") as Record<
    string,
    unknown
  >[]) {
    const sample = toSample(row);
    state.samples[sample.id] = sample;
  }
  const old = await tx.getFirstAsync<{ payload: string }>(
    "SELECT json_group_array(payload) payload FROM (SELECT payload FROM outbox ORDER BY created_at,id)",
    [],
  );
  for (const raw of JSON.parse(old?.payload ?? "[]") as string[]) {
    const samples = (JSON.parse(raw) as VitalSample[]).filter(
      (s) => s.userId === user,
    );
    enqueueInto(state, samples, createUuid);
  }
  return state;
});
export const {
  cachedVitals,
  queueVitals,
  queuedChanges,
  prepareChange,
  acceptChange,
  failChange,
  applyRemotePage,
  syncCursor,
  lastVitalSyncAt,
  saveVitalSyncAt,
  resolveConflict,
} = createVitalStorage(transact, createUuid);
export const createId = createUuid;

export async function clearAccountVitals(user: string) {
  await transact(user, (state) => Object.assign(state, emptyVitalState()));
  const db = await database();
  await db.withExclusiveTransactionAsync(async (tx) => {
    await tx.runAsync("DELETE FROM vital_samples WHERE user_id=?", [user]);
    await tx.runAsync("UPDATE outbox SET payload=(SELECT json_group_array(json(value)) FROM json_each(outbox.payload) WHERE json_extract(value,'$.userId') IS NOT ?) WHERE EXISTS(SELECT 1 FROM json_each(outbox.payload) WHERE json_extract(value,'$.userId')=?)", [user, user]);
    await tx.runAsync("DELETE FROM outbox WHERE json_array_length(payload)=0");
    await tx.runAsync("DELETE FROM app_metadata WHERE instr(key,?)>0", [user]);
  });
}
