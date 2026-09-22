import { z } from "zod";
export const setupSchema = z.object({
  user_id: z.string().uuid(),
  preferred_name: z.string().trim().min(1).max(80).nullable(),
  unit_system: z.enum(["us", "metric"]),
  fluid_unit: z.enum(["fl_oz", "ml"]),
  step: z.enum(["name", "goals", "fluids", "convenience", "summary"]),
  completed_at: z.string().nullable(),
  dismissed_setup: z.boolean(),
  version: z.number().int().positive(),
});
export type AccountSetup = z.infer<typeof setupSchema>;
export type SetupChanges = Partial<
  Pick<
    AccountSetup,
    "preferred_name" | "unit_system" | "fluid_unit" | "step" | "dismissed_setup"
  >
> & { complete?: boolean };
export const setupSteps = [
  "name",
  "goals",
  "fluids",
  "convenience",
  "summary",
] as const;
export function preferredName(value: string) {
  return (
    z.string().trim().max(80, "Use 80 characters or fewer.").parse(value) ||
    null
  );
}
export function defaultUnits(locale: string) {
  return /(?:-|_)(US|LR|MM)\b/i.test(locale)
    ? ("us" as const)
    : ("metric" as const);
}
export function setupDestination(setup: AccountSetup) {
  return setup.completed_at ? ("/(app)" as const) : ("/onboarding" as const);
}
