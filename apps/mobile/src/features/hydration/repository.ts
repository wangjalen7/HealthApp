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
  const { error } = await supabase.from("hydration_entries").insert({
    id: createId(),
    user_id: userId,
    fluid_name: value.fluidName,
    volume_ml: hydrationAmountToMl(value.amount, value.unit),
    category_id: value.categoryId,
    alcohol_status: value.alcoholStatus,
    counting_policy: "beverage_volume_v1",
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getTodayHydrationTotals(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows: {
    volume_ml: unknown;
    counting_policy?: unknown;
    alcohol_status?: unknown;
  }[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("hydration_entries")
      .select("volume_ml, counting_policy, alcohol_status")
      .eq("user_id", userId)
      .gte("occurred_at", start.toISOString())
      .lt("occurred_at", end.toISOString())
      .order("occurred_at")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return fluidTotals(rows);
}
export async function getTodayHydrationMl(userId: string): Promise<number> {
  return (await getTodayHydrationTotals(userId)).countedMl;
}

export type HydrationHistoryEntry = {
  id: string;
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
): Promise<void> {
  const { error } = await supabase
    .from("hydration_entries")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getHydrationHistory(
  userId: string,
): Promise<HydrationHistoryEntry[]> {
  const { data, error } = await supabase
    .from("hydration_entries")
    .select(
      "id, fluid_name, volume_ml, occurred_at, category_id, alcohol_status, counting_policy",
    )
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((entry) => ({
    id: String(entry.id),
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
    .select("id")
    .eq("user_id", userId)
    .eq("name", value.fluidName)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  const { error } = await supabase.from("saved_drinks").upsert(
    {
      id: data?.id ?? createId(),
      user_id: userId,
      name: value.fluidName,
      category_id: value.categoryId,
      alcohol_status: value.alcoholStatus,
      default_volume_ml: hydrationAmountToMl(value.amount, value.unit),
      archived_at: null,
    },
    { onConflict: "user_id,name" },
  );
  if (error) throw new Error(error.message);
}
export async function archiveDrinkPreset(userId: string, id: string) {
  const { error } = await supabase
    .from("saved_drinks")
    .update({ archived_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
export async function classifyHydration(
  userId: string,
  id: string,
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
  const { error } = await supabase
    .from("hydration_entries")
    .update({
      category_id: categoryId,
      alcohol_status: alcoholStatus,
      counting_policy: "beverage_volume_v1",
    })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}
