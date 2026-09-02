import { z } from "zod";

export const hydrationUnitSchema = z.enum(["ml", "fl_oz", "cup"]);
export type HydrationUnit = z.infer<typeof hydrationUnitSchema>;

export const hydrationInputSchema = z.object({
  fluidName: z.string().trim().min(1).max(80),
  amount: z.number().positive().max(20000),
  unit: hydrationUnitSchema,
});
export type HydrationInput = z.infer<typeof hydrationInputSchema>;

const MILLILITERS_PER_FLUID_OUNCE = 29.5735295625;
const MILLILITERS_PER_CUP = 236.5882365;

export function hydrationAmountToMl(
  amount: number,
  unit: HydrationUnit,
): number {
  const multiplier =
    unit === "ml"
      ? 1
      : unit === "fl_oz"
        ? MILLILITERS_PER_FLUID_OUNCE
        : MILLILITERS_PER_CUP;
  return Math.round(amount * multiplier * 100) / 100;
}

export function mlToFluidOunces(volumeMl: number): number {
  return Math.round((volumeMl / MILLILITERS_PER_FLUID_OUNCE) * 10) / 10;
}

export const hydrationUnitLabel: Record<HydrationUnit, string> = {
  ml: "mL",
  fl_oz: "fl oz",
  cup: "cups",
};
