export type MutationReply =
  | { status: "accepted"; data: unknown }
  | { status: "conflict"; current: unknown; id?: string; field?: string };

export class EditConflict extends Error {
  constructor(
    public readonly current: unknown,
    public readonly field?: string,
  ) {
    super(
      "This record changed on another device. Your edits are still here. Reopen the latest record to compare before saving again.",
    );
    this.name = "EditConflict";
  }
}

export class RejectedMutation extends Error {}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export type PendingMutation = {
  id: string;
  fingerprint: string;
  request: Record<string, unknown>;
  completed?: boolean;
  data?: unknown;
};
export type MutationStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/** Durable intent precedes the first network attempt. A changed draft cannot
 * silently replace a save whose outcome is still unknown. */
export function createMutationRunner(deps: {
  storage: MutationStorage;
  id(): string;
  assertAccount(userId: string): Promise<void>;
  send(userId: string, pending: PendingMutation): Promise<MutationReply>;
  exclusive?<T>(key: string, work: () => Promise<T>): Promise<T>;
}) {
  const running = new Map<string, Promise<unknown>>();
  return async function run<T>(
    userId: string,
    slot: string,
    intent: unknown,
    build: () => Record<string, unknown>,
    retainUntilDraftCleared = false,
  ): Promise<T> {
    const key = `healthapp:pending-write:v2:${userId}:${slot}`;
    if (running.has(key)) throw new Error("This save is already in progress.");
    const execute = async () => {
      await deps.assertAccount(userId);
      const raw = await deps.storage.getItem(key);
      const fingerprint = canonicalJson(intent);
      const pending: PendingMutation = raw
        ? JSON.parse(raw)
        : { id: deps.id(), fingerprint, request: build() };
      if (pending.fingerprint !== fingerprint)
        throw new Error(
          "An earlier save is still unconfirmed. Retry its original details before saving a changed entry. Your current draft is retained.",
        );
      if (pending.completed) return pending.data as T;
      if (!raw) await deps.storage.setItem(key, JSON.stringify(pending));
      await deps.assertAccount(userId);
      let reply: MutationReply;
      try {
        reply = await deps.send(userId, pending);
      } catch (error) {
        // A database constraint/validation rejection rolled back the transaction.
        // Allow corrected input while preserving all uncertain/network outcomes.
        if (error instanceof RejectedMutation)
          await deps.storage.removeItem(key);
        throw error;
      }
      await deps.assertAccount(userId);
      if (reply.status === "conflict") {
        // Rejected operations have no server effects; the editable draft remains.
        await deps.storage.removeItem(key);
        throw new EditConflict(reply.current, reply.field);
      }
      if (retainUntilDraftCleared)
        await deps.storage.setItem(
          key,
          JSON.stringify({ ...pending, completed: true, data: reply.data }),
        );
      else await deps.storage.removeItem(key);
      return reply.data as T;
    };
    const work = deps.exclusive ? deps.exclusive(key, execute) : execute();
    running.set(key, work);
    try {
      return await work;
    } finally {
      running.delete(key);
    }
  };
}
