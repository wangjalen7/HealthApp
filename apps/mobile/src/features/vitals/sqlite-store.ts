import {
  emptyVitalState,
  type VitalState,
  type VitalTransaction,
} from "./store-model";

export interface VitalSqlConnection {
  getFirstAsync<T>(sql: string, params: string[]): Promise<T | null>;
  runAsync(sql: string, params: string[]): Promise<unknown>;
}
export interface VitalSqlDatabase {
  withExclusiveTransactionAsync(
    work: (tx: VitalSqlConnection) => Promise<void>,
  ): Promise<void>;
}
export const vitalStateSchema = `
CREATE TABLE IF NOT EXISTS vital_cache_v2(user_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vital_outbox_v2(user_id TEXT PRIMARY KEY NOT NULL,payload TEXT NOT NULL);`;

export function sqliteVitalTransactions(
  database: () => Promise<VitalSqlDatabase>,
  migrate: (
    user: string,
    tx: VitalSqlConnection,
  ) => Promise<VitalState> = async () => emptyVitalState(),
): VitalTransaction {
  // Exclusive SQLite transactions plus serialization avoid transaction leakage
  // and SQLITE_BUSY during overlapping foreground/import/manual operations.
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(user: string, update: (state: VitalState) => T): Promise<T> => {
    const work = tail
      .catch(() => undefined)
      .then(async () => {
        const db = await database();
        let result!: T;
        await db.withExclusiveTransactionAsync(async (tx) => {
          const cache = await tx.getFirstAsync<{ payload: string }>(
            "SELECT payload FROM vital_cache_v2 WHERE user_id=?",
            [user],
          );
          const outbox = await tx.getFirstAsync<{ payload: string }>(
            "SELECT payload FROM vital_outbox_v2 WHERE user_id=?",
            [user],
          );
          if (Boolean(cache) !== Boolean(outbox))
            throw new Error(
              "The local sync store is incomplete. Pending changes have been preserved.",
            );
          const state: VitalState =
            cache && outbox
              ? {
                  ...JSON.parse(cache.payload),
                  operations: JSON.parse(outbox.payload),
                }
              : await migrate(user, tx);
          result = update(state);
          const { operations, ...cached } = state;
          await tx.runAsync(
            "INSERT INTO vital_cache_v2(user_id,payload) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload",
            [user, JSON.stringify(cached)],
          );
          await tx.runAsync(
            "INSERT INTO vital_outbox_v2(user_id,payload) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload",
            [user, JSON.stringify(operations)],
          );
        });
        return result;
      });
    tail = work;
    return work;
  };
}
