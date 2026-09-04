export const progressPhotoDailyLimit = 3;
export const progressPhotoMaxDimension = 1440;
export const progressPhotoMaxBytes = 2 * 1024 * 1024;
export const progressPhotoTargetBytes = 900_000;
export const progressPhotoStorageFullMessage =
  "Photo storage is full. Delete saved progress photos or free up Supabase Storage, then try again.";

type StorageErrorShape = {
  code?: unknown;
  error?: unknown;
  message?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function storageErrorText(error: StorageErrorShape): string {
  return [error.code, error.error, error.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

function hasStatus(error: StorageErrorShape, status: number): boolean {
  return [error.status, error.statusCode].some(
    (value) => Number(value) === status,
  );
}

/** Identifies Supabase's documented quota response plus legacy storage messages. */
export function isProgressPhotoStorageFullError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const storageError = error as StorageErrorShape;
  if (hasStatus(storageError, 402) || hasStatus(storageError, 507)) return true;
  const text = storageErrorText(storageError);
  return [
    "storage quota",
    "quota exceeded",
    "storage is full",
    "storage full",
    "insufficient storage",
    "tenant quota",
    "exceeded storage",
    "storage limit exceeded",
    "exceeded_storage_quota",
    "storage_quota_exceeded",
    "exceed_storage_quota",
    "insufficient_storage",
  ].some((phrase) => text.includes(phrase));
}

export function localPhotoDay(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new Error("Invalid photo date.");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function nextDailyPhotoSlot(usedSlots: number[]): number | undefined {
  const used = new Set(usedSlots);
  for (let slot = 1; slot <= progressPhotoDailyLimit; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return undefined;
}

export function approximateBase64Bytes(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}
