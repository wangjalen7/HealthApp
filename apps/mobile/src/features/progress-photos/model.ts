export const progressPhotoDailyLimit = 3;
export const progressPhotoMaxDimension = 1440;
export const progressPhotoMaxBytes = 2 * 1024 * 1024;
export const progressPhotoTargetBytes = 900_000;

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
