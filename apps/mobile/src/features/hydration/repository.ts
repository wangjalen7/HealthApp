import { entryTimestamp } from "../../lib/entry-date";
import { createRecords, changeRecord } from "../../lib/mutations";
import { collectPages } from "../../lib/pagination";
import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import {
  fluidContribution,
  fluidTotals,
  hydrationAmountToMl,
  hydrationInputSchema,
  type HydrationInput,
} from "./model";

export async function saveHydration(
  userId: string,
  input: HydrationInput,
): Promise<void> {
  const value = hydrationInputSchema.parse(input);
  const occurredAt = entryTimestamp(value.entryDay);
  await createRecords(
    userId,
    "hydration_entries",
    "hydration:create",
    value,
    () => [
      {
        id: createId(),
        user_id: userId,
        fluid_name: value.fluidName,
        volume_ml: hydrationAmountToMl(value.amount, value.unit),
        category_id: value.categoryId,
        alcohol_status: value.alcoholStatus,
        counting_policy: "beverage_volume_v1",
        occurred_at: occurredAt,
      },
    ],
  );
}

export async function getTodayHydrationTotals(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await collectPages((after) => {
    let query = supabase
      .from("hydration_entries")
      .select("id, volume_ml, counting_policy, alcohol_status")
      .eq("user_id", userId)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  return fluidTotals(rows);
}
export async function getTodayHydrationMl(userId: string): Promise<number> {
  return (await getTodayHydrationTotals(userId)).countedMl;
}

export type HydrationHistoryEntry = {
  id: string;
  version: number;
  fluidName: string;
  volumeMl: number;
  countedMl: number | null;
  categoryId: string;
  alcoholStatus: string | null;
  countingPolicy: string;
  occurredAt: string;
};

export async function deleteHydration(
  userId: string,
  id: string,
  version: number,
): Promise<void> {
  await changeRecord(userId, "hydration_entries", id, version);
}

export async function getHydrationHistory(
  userId: string,
): Promise<HydrationHistoryEntry[]> {
  const data = await collectPages((after) => {
    let query = supabase
      .from("hydration_entries")
      .select("*")
      .eq("user_id", userId)
      .order("id")
      .limit(200);
    if (after) query = query.gt("id", after);
    return query;
  });
  data.sort(
    (a, b) =>
      b.occurred_at.localeCompare(a.occurred_at) || b.id.localeCompare(a.id),
  );
  return (data ?? []).map((entry) => ({
    id: String(entry.id),
    version: Number(entry.version),
    fluidName: String(entry.fluid_name),
    volumeMl: Number(entry.volume_ml),
    countedMl: fluidContribution(entry),
    categoryId: entry.category_id ?? "legacy",
    alcoholStatus: entry.alcohol_status ?? null,
    countingPolicy: entry.counting_policy ?? "legacy_volume_v1",
    occurredAt: String(entry.occurred_at),
  }));
}

export type SavedDrink = {
  id: string;
  name: string;
  categoryId: HydrationInput["categoryId"];
  alcoholStatus: HydrationInput["alcoholStatus"];
  volumeMl: number;
};
export async function getSavedDrinks(userId: string): Promise<SavedDrink[]> {
  const { data, error } = await supabase
    .from("saved_drinks")
    .select("id, name, category_id, alcohol_status, default_volume_ml")
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    alcoholStatus: row.alcohol_status,
    volumeMl: Number(row.default_volume_ml),
  }));
}
export async function saveDrinkPreset(userId: string, input: HydrationInput) {
  const value = hydrationInputSchema.parse(input);
  // Resolve by name so retrying a failed log does not create duplicate favorites.
  const { data, error: lookupError } = await supabase
    .from("saved_drinks")
    .select("id,version")
    .eq("user_id", userId)
    .eq("name", value.fluidName)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  const fields = {
    name: value.fluidName,
    category_id: value.categoryId,
    alcohol_status: value.alcoholStatus,
    default_volume_ml: hydrationAmountToMl(value.amount, value.unit),
    archived_at: null,
  };
  if (data)
    await changeRecord(
      userId,
      "saved_drinks",
      data.id,
      Number(data.version),
      fields,
    );
  else
    await createRecords(
      userId,
      "saved_drinks",
      "drink-preset:create",
      value,
      () => [{ id: createId(), ...fields }],
    );
}
export async function archiveDrinkPreset(userId: string, id: string) {
  const { data, error } = await supabase
    .from("saved_drinks")
    .select("version")
    .eq("user_id", userId)
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  await changeRecord(userId, "saved_drinks", id, Number(data.version), {
    archived_at: new Date().toISOString(),
  });
}
export async function classifyHydration(
  userId: string,
  id: string,
  version: number,
  categoryId: HydrationInput["categoryId"],
  alcoholStatus: HydrationInput["alcoholStatus"],
) {
  hydrationInputSchema.parse({
    fluidName: "Drink",
    amount: 1,
    unit: "ml",
    categoryId,
    alcoholStatus,
  });
  await changeRecord(userId, "hydration_entries", id, version, {
    category_id: categoryId,
    alcohol_status: alcoholStatus,
    counting_policy: "beverage_volume_v1",
  });
}
