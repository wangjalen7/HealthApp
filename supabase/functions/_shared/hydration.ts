// Shared with the mobile app. Credit measures beverage-goal progress, not water retention.
export type FluidRow = {
  volume_ml: unknown;
  counting_policy?: unknown;
  alcohol_status?: unknown;
};
export function fluidContribution(row: FluidRow): number | null {
  const volume = Number(row.volume_ml);
  if (!Number.isFinite(volume) || volume <= 0) return 0;
  if (row.counting_policy == null || row.counting_policy === "legacy_volume_v1")
    return volume;
  if (row.counting_policy !== "beverage_volume_v1") return null;
  if (row.alcohol_status === "nonalcoholic") return volume;
  if (row.alcohol_status === "alcoholic") return 0;
  return null;
}
export function fluidTotals(rows: FluidRow[]) {
  return rows.reduce(
    (total, row) => {
      const volume = Number(row.volume_ml);
      if (!Number.isFinite(volume) || volume <= 0) return total;
      const credit = fluidContribution(row);
      total.consumedMl += volume;
      total.countedMl += credit ?? 0;
      if (credit === null) total.pendingMl += volume;
      if (
        row.counting_policy === "beverage_volume_v1" &&
        row.alcohol_status === "alcoholic"
      )
        total.alcoholMl += volume;
      return total;
    },
    { consumedMl: 0, countedMl: 0, pendingMl: 0, alcoholMl: 0 },
  );
}
