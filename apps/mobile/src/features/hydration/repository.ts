import { supabase } from "../../lib/supabase";
import { createId } from "../vitals/storage";
import {
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
    occurred_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function getTodayHydrationMl(userId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("hydration_entries")
    .select("volume_ml")
    .eq("user_id", userId)
    .gte("occurred_at", start.toISOString());
  if (error) throw new Error(error.message);
  return (data ?? []).reduce(
    (total, entry) => total + Number(entry.volume_ml),
    0,
  );
}

export type HydrationHistoryEntry = {
  id: string;
  fluidName: string;
  volumeMl: number;
  occurredAt: string;
};

export async function getHydrationHistory(
  userId: string,
): Promise<HydrationHistoryEntry[]> {
  const { data, error } = await supabase
    .from("hydration_entries")
    .select("id, fluid_name, volume_ml, occurred_at")
    .eq("user_id", userId)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []).map((entry) => ({
    id: String(entry.id),
    fluidName: String(entry.fluid_name),
    volumeMl: Number(entry.volume_ml),
    occurredAt: String(entry.occurred_at),
  }));
}
