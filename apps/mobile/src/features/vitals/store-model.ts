import type { VitalSample } from "../../domain/vitals";

export type VitalOperation = {
  id: string;
  samples: VitalSample[];
  attempts: number;
  error?: string;
  dependencies: Record<string, string>;
  request?: Record<string, unknown>;
  conflict?: { current: VitalSample | null; id?: string };
};
export type VitalState = {
  samples: Record<string, VitalSample>;
  remote: Record<string, VitalSample>;
  operations: VitalOperation[];
  cursor: number;
  lastSync?: string;
};
export const emptyVitalState = (): VitalState => ({
  samples: {},
  remote: {},
  operations: [],
  cursor: 0,
});
export type VitalTransaction = <T>(
  userId: string,
  update: (state: VitalState) => T,
) => Promise<T>;

export function vitalRow(sample: VitalSample) {
  return {
    kind: sample.kind,
    value: sample.value,
    unit: sample.unit,
    occurred_at: sample.occurredAt,
    correlation_id: sample.correlationId ?? null,
    source: sample.source,
    external_id: sample.externalId ?? null,
    source_name: sample.sourceName ?? null,
  };
}
export function readVitalRow(row: Record<string, unknown>): VitalSample {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    version: Number(row.version),
    kind: row.kind as VitalSample["kind"],
    value: Number(row.value),
    unit: String(row.unit),
    occurredAt: String(row.occurred_at),
    createdAt: String(row.created_at),
    source: row.source as VitalSample["source"],
    correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
    externalId: row.external_id ? String(row.external_id) : undefined,
    sourceName: row.source_name ? String(row.source_name) : undefined,
    deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
  };
}

export function enqueueInto(
  state: VitalState,
  samples: VitalSample[],
  id: () => string,
) {
  // One operation per sample keeps dependency chains precise. The entire local
  // batch (including paired BP readings) is committed in the same transaction.
  for (const sample of samples) {
    const previous = state.operations.findLast((op) =>
      op.samples.some((s) => s.id === sample.id),
    );
    const base = sample.version ?? state.samples[sample.id]?.version ?? 0;
    const value = { ...sample, version: base };
    state.samples[sample.id] = value;
    state.operations.push({
      id: id(),
      samples: [value],
      attempts: 0,
      dependencies: previous ? { [sample.id]: previous.id } : {},
    });
  }
}

export function createVitalStorage(
  transact: VitalTransaction,
  id: () => string,
) {
  return {
    cachedVitals: (userId: string) =>
      transact(userId, (s) =>
        Object.values(s.samples).sort((a, b) =>
          b.occurredAt.localeCompare(a.occurredAt),
        ),
      ),
    queueVitals: async (samples: VitalSample[]) => {
      if (!samples.length) return;
      const user = samples[0].userId;
      if (samples.some((s) => s.userId !== user))
        throw new Error("Cannot queue readings from different accounts.");
      await transact(user, (state) => enqueueInto(state, samples, id));
    },
    queuedChanges: (user: string) => transact(user, (s) => s.operations),
    prepareChange: (user: string, operationId: string) =>
      transact(user, (state) => {
        const operation = state.operations.find((op) => op.id === operationId);
        if (
          !operation ||
          operation.conflict ||
          Object.keys(operation.dependencies).length
        )
          return undefined;
        if (!operation.request) {
          const sample = operation.samples[0];
          const action = sample.deletedAt
            ? "delete"
            : sample.version
              ? "update"
              : "create";
          const values = vitalRow(sample);
          const updateValues = {
            value: sample.value,
            unit: sample.unit,
            occurred_at: sample.occurredAt,
            correlation_id: sample.correlationId ?? null,
            source_name: sample.sourceName ?? null,
          };
          operation.request = {
            table: "vital_samples",
            action,
            rows: [
              {
                id: sample.id,
                version: sample.version ?? 0,
                values:
                  action === "create"
                    ? values
                    : action === "update"
                      ? updateValues
                      : {},
              },
            ],
          };
        }
        return operation;
      }),
    acceptChange: (user: string, operationId: string, samples: VitalSample[]) =>
      transact(user, (state) => {
        if (samples.some((s) => s.userId !== user))
          throw new Error("Sync returned a different account.");
        state.operations = state.operations.filter(
          (op) => op.id !== operationId,
        );
        for (const sample of samples) {
          const latest =
            (state.remote[sample.id]?.version ?? 0) > (sample.version ?? 0)
              ? state.remote[sample.id]
              : sample;
          state.remote[sample.id] = latest;
          for (const op of state.operations) {
            if (op.dependencies[sample.id] !== operationId) continue;
            delete op.dependencies[sample.id];
            op.samples = op.samples.map((s) =>
              s.id === sample.id ? { ...s, version: sample.version } : s,
            );
          }
          // Acknowledging an older request must not overwrite a newer local edit.
          if (
            !state.operations.some((op) =>
              op.samples.some((s) => s.id === sample.id),
            )
          )
            state.samples[sample.id] = latest;
        }
      }),
    failChange: (
      user: string,
      operationId: string,
      error: string,
      conflict?: VitalOperation["conflict"],
    ) =>
      transact(user, (state) => {
        const op = state.operations.find((o) => o.id === operationId);
        if (!op) return;
        op.attempts++;
        op.error = error;
        if (conflict) op.conflict = conflict;
      }),
    applyRemotePage: (user: string, samples: VitalSample[], cursor: number) =>
      transact(user, (state) => {
        if (samples.some((s) => s.userId !== user) || cursor < state.cursor)
          throw new Error("Invalid sync page.");
        for (const sample of samples) {
          if ((state.remote[sample.id]?.version ?? 0) > (sample.version ?? 0))
            continue;
          state.remote[sample.id] = sample;
          for (const op of state.operations) {
            if (
              op.conflict &&
              op.samples.some((s) => s.id === sample.id) &&
              (op.conflict.current?.version ?? 0) <= (sample.version ?? 0)
            )
              op.conflict.current = sample;
          }
          if (
            !state.operations.some((op) =>
              op.samples.some((s) => s.id === sample.id),
            )
          )
            state.samples[sample.id] = sample;
        }
        state.cursor = cursor;
      }),
    syncCursor: (user: string) => transact(user, (s) => s.cursor),
    lastVitalSyncAt: (user: string) => transact(user, (s) => s.lastSync),
    saveVitalSyncAt: (user: string, date: string) =>
      transact(user, (s) => {
        s.lastSync = date;
      }),
    resolveConflict: (
      user: string,
      sampleId: string,
      choice: "remote" | "local",
      reviewedVersion: number | null,
    ) =>
      transact(user, (state) => {
        const conflicting = state.operations.find(
          (op) => op.conflict && op.samples.some((s) => s.id === sampleId),
        );
        if (!conflicting)
          throw new Error("Reopen the pending changes to review this reading.");
        const local = state.samples[sampleId];
        const reviewed = conflicting.conflict?.current;
        const shadow = state.remote[sampleId];
        const remote =
          (shadow?.version ?? 0) > (reviewed?.version ?? 0) ? shadow : reviewed;
        if ((remote?.version ?? null) !== reviewedVersion)
          throw new Error(
            "This reading changed again. Reopen Pending readings and saves to review the latest version.",
          );
        state.operations = state.operations.filter(
          (op) => !op.samples.some((s) => s.id === sampleId),
        );
        if (remote) state.samples[sampleId] = remote;
        else delete state.samples[sampleId];
        if (
          choice === "local" &&
          !(local.deletedAt && (!remote || remote.deletedAt))
        ) {
          // Deleted records are never restored. Explicit recovery creates a new ID.
          const recovered =
            remote && !remote.deletedAt
              ? { ...local, version: remote.version }
              : {
                  ...local,
                  id: id(),
                  version: 0,
                  deletedAt: undefined,
                  source: "manual" as const,
                  externalId: undefined,
                  createdAt: new Date().toISOString(),
                };
          enqueueInto(state, [recovered], id);
        }
      }),
  };
}
