import { z } from "zod";
import {
  drinkCategories,
  categoryAlcoholStatus,
  type DrinkCategoryId,
} from "./categories";
export {
  fluidContribution,
  fluidTotals,
} from "../../../../../supabase/functions/_shared/hydration";

export const hydrationUnitSchema = z.enum(["ml", "fl_oz", "cup"]);
export type HydrationUnit = z.infer<typeof hydrationUnitSchema>;

export const hydrationInputSchema = z
  .object({
    categoryId: z.enum(
      drinkCategories.map((item) => item.id) as [
        DrinkCategoryId,
        ...DrinkCategoryId[],
      ],
    ),
    alcoholStatus: z.enum(["nonalcoholic", "alcoholic", "unknown"]),
    fluidName: z.string().trim().min(1).max(80),
    amount: z.number().positive().max(20000),
    unit: hydrationUnitSchema,
  })
  .superRefine((value, ctx) => {
    const volume = hydrationAmountToMl(value.amount, value.unit);
    if (volume <= 0 || volume > 20000)
      ctx.addIssue({
        code: "custom",
        message: "Enter a volume between 0.01 and 20,000 mL.",
        path: ["amount"],
      });
    if (
      categoryAlcoholStatus(value.categoryId, value.alcoholStatus) !==
      value.alcoholStatus
    )
      ctx.addIssue({
        code: "custom",
        message: "Alcohol status does not match the category.",
        path: ["alcoholStatus"],
      });
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
