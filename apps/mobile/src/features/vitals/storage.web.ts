import AsyncStorage from '@react-native-async-storage/async-storage';

import type { VitalSample } from '../../domain/vitals';

type OutboxRecord = { id: string; operation: 'upsert_vitals'; payload: string; attempts: number };
const samplesKey = 'healthapp:vital-samples';
const outboxKey = 'healthapp:vital-outbox';
const syncKey = (userId: string) => `healthapp:vital-last-sync:${userId}`;

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    const value = await AsyncStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch { return fallback; }
}

async function write(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function cachedVitals(userId: string): Promise<VitalSample[]> {
  return (await read<VitalSample[]>(samplesKey, [])).filter((sample) => sample.userId === userId).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
}

export async function saveCachedVitals(samples: VitalSample[]): Promise<void> {
  if (!samples.length) return;
  const existing = await read<VitalSample[]>(samplesKey, []);
  const replacements = new Map(samples.map((sample) => [sample.id, sample]));
  const merged = existing.map((sample) => replacements.get(sample.id) ?? sample);
  for (const sample of samples) if (!existing.some((item) => item.id === sample.id)) merged.push(sample);
  await write(samplesKey, merged);
}

export async function enqueueVitals(samples: VitalSample[]): Promise<void> {
  const changes = await read<OutboxRecord[]>(outboxKey, []);
  changes.push({ id: createId(), operation: 'upsert_vitals', payload: JSON.stringify(samples), attempts: 0 });
  await write(outboxKey, changes);
}

export async function queuedChanges(): Promise<OutboxRecord[]> {
  return read<OutboxRecord[]>(outboxKey, []);
}

export async function completeChange(id: string): Promise<void> {
  await write(outboxKey, (await queuedChanges()).filter((change) => change.id !== id));
}

export async function failChange(id: string): Promise<void> {
  await write(outboxKey, (await queuedChanges()).map((change) => change.id === id ? { ...change, attempts: change.attempts + 1 } : change));
}

export async function lastVitalSyncAt(userId: string): Promise<string | undefined> {
  try { return (await AsyncStorage.getItem(syncKey(userId))) ?? undefined; } catch { return undefined; }
}
export async function saveVitalSyncAt(userId: string, value: string): Promise<void> { await AsyncStorage.setItem(syncKey(userId), value); }

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
