import { z } from "zod";

export const entryDaySchema = z.iso.date().optional();
export function localEntryDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** Keep the selected local calendar day, not UTC midnight. Undefined means today at save time. */
export function entryTimestamp(day?: string, now = new Date()): string {
  const selected = entryDaySchema.parse(day) ?? localEntryDay(now);
  if (selected > localEntryDay(now))
    throw new Error("Choose today or an earlier entry date.");
  const [year, month, date] = selected.split("-").map(Number);
  const at = new Date(now);
  at.setFullYear(year, month - 1, date);
  return at.toISOString();
}

export type EntryDateProps = {
  value?: string;
  onChange: (day: string | undefined) => void;
  disabled?: boolean;
};
