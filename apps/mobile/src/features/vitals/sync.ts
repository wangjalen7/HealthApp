import {
  vitalSources,
  type VitalSample,
  type VitalSource,
} from "../../domain/vitals";
import { supabase } from "../../lib/supabase";
import {
  cachedVitals,
  completeChange,
  enqueueVitals,
  failChange,
  lastVitalSyncAt,
  queuedChanges,
  saveCachedVitals,
  saveVitalSyncAt,
} from "./storage";

const remoteRow = (sample: VitalSample) => ({
  id: sample.id,
  user_id: sample.userId,
  kind: sample.kind,
  value: sample.value,
  unit: sample.unit,
  occurred_at: sample.occurredAt,
  correlation_id: sample.correlationId ?? null,
  source: sample.source,
  created_at: sample.createdAt,
  deleted_at: sample.deletedAt ?? null,
});

const readSource = (value: unknown): VitalSource =>
  vitalSources.includes(value as VitalSource)
    ? (value as VitalSource)
    : "manual";
const localSample = (row: Record<string, unknown>): VitalSample => ({
  id: String(row.id),
  userId: String(row.user_id),
  kind: row.kind as VitalSample["kind"],
  value: Number(row.value),
  unit: String(row.unit),
  occurredAt: String(row.occurred_at),
  correlationId: row.correlation_id ? String(row.correlation_id) : undefined,
  source: readSource(row.source),
  createdAt: String(row.created_at),
  deletedAt: row.deleted_at ? String(row.deleted_at) : undefined,
});

export async function queueLocalVitals(samples: VitalSample[]): Promise<void> {
  await saveCachedVitals(samples);
  await enqueueVitals(samples);
}

export async function markVitalsDeleted(
  samples: VitalSample[],
): Promise<VitalSample[]> {
  if (!samples.length) return [];
  const deletedAt = new Date().toISOString();
  const tombstones = samples.map((sample) => ({ ...sample, deletedAt }));
  await queueLocalVitals(tombstones);
  return tombstones;
}

export async function syncVitals(
  userId: string,
): Promise<{
  synced: number;
  pending: number;
  lastSyncedAt?: string;
  error?: string;
}> {
  let synced = 0;
  const changes = await queuedChanges();
  for (const change of changes) {
    const samples = JSON.parse(change.payload) as VitalSample[];
    if (samples.some((sample) => sample.userId !== userId)) continue;
    const { error } = await supabase
      .from("vital_samples")
      .upsert(samples.map(remoteRow), { onConflict: "id" });
    if (error) {
      await failChange(change.id, error.message);
      return { synced, pending: changes.length - synced, error: error.message };
    }
    await completeChange(change.id);
    synced += 1;
  }

  const { data, error } = await supabase
    .from("vital_samples")
    .select("*")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false });
  if (error) return { synced, pending: 0, error: error.message };
  await saveCachedVitals(
    (data ?? []).map((row) => localSample(row as Record<string, unknown>)),
  );
  const lastSyncedAt = new Date().toISOString();
  await saveVitalSyncAt(userId, lastSyncedAt);
  return { synced, pending: 0, lastSyncedAt };
}

export const loadCachedVitals = cachedVitals;
export const loadLastVitalSyncAt = lastVitalSyncAt;
