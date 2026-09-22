import { z } from "zod";
export const habits = [
  "daily_logging",
  "food_logging",
  "calorie_target",
  "protein_target",
  "fluid_logging",
  "fluid_target",
  "training",
  "weight",
  "bp",
  "reminder",
] as const;
export type Habit = (typeof habits)[number];
export const habitLabels: Record<Habit, string> = {
  daily_logging: "Daily logging",
  food_logging: "Food logging",
  calorie_target: "Calorie target",
  protein_target: "Protein target",
  fluid_logging: "Fluid logging",
  fluid_target: "Fluid target",
  training: "Training consistency",
  weight: "Weight logging",
  bp: "BP logging",
  reminder: "Reminder consistency",
};
export const actionNames = [
  "Workout",
  "Food",
  "Fluids",
  "Weight",
  "Blood pressure",
  "Reminders",
] as const;
export type ActionName = (typeof actionNames)[number];
export const actionRoutes = {
  Workout: "/(app)/workout",
  Food: "/(app)/nutrition",
  Fluids: "/(app)/water",
  Weight: "/(app)/weight",
  "Blood pressure": "/(app)/track",
  Reminders: "/(app)/reminders",
} as const;
const empty = z.strictObject({});
const configSchemas = {
  weight: empty,
  bp: empty,
  calories: empty,
  protein: empty,
  fluids: empty,
  calendar: empty,
  weight_trend: empty,
  bp_trend: empty,
  meals: empty,
  training: z.strictObject({
    period: z.enum(["week", "last7"]).default("week"),
  }),
  actions: z.strictObject({
    actions: z
      .array(z.enum(actionNames))
      .min(2)
      .max(6)
      .refine((a) => new Set(a).size === a.length),
  }),
  streaks: z.strictObject({
    reminderId: z.string().optional(),
    habits: z
      .array(z.enum(habits))
      .min(1)
      .max(4)
      .refine((a) => new Set(a).size === a.length),
  }),
};
export type WidgetType = keyof typeof configSchemas;
export type WidgetSize = "small" | "wide";
export type Widget = {
  id: string;
  type: WidgetType;
  size: WidgetSize;
  config: {
    period?: "week" | "last7";
    actions?: ActionName[];
    habits?: Habit[];
    reminderId?: string;
  };
};
type Definition = {
  title: string;
  description: string;
  sizes: WidgetSize[];
  defaults: Widget["config"];
  needs: string[];
  schema: z.ZodType;
};
const definition = (
  type: WidgetType,
  title: string,
  description: string,
  needs: string[],
  wide = false,
  defaults: Widget["config"] = {},
): Definition => ({
  title,
  description,
  needs,
  sizes: wide ? ["wide"] : ["small", "wide"],
  defaults,
  schema: configSchemas[type],
});
export const registry: Record<WidgetType, Definition> = {
  weight: definition("weight", "Weight", "Latest reading and measured time", [
    "vitals",
  ]),
  bp: definition("bp", "Blood pressure", "Latest paired reading", ["vitals"]),
  calories: definition(
    "calories",
    "Calories",
    "Today's logged calories and saved goal",
    ["food", "goals"],
  ),
  protein: definition(
    "protein",
    "Protein",
    "Today's protein and saved or automatic goal",
    ["food", "goals"],
  ),
  fluids: definition(
    "fluids",
    "Fluids",
    "Counted volume and pending classification",
    ["fluids", "goals"],
  ),
  training: definition(
    "training",
    "Training Summary",
    "Completed sessions, training days and sets",
    ["training"],
    false,
    { period: "week" },
  ),
  meals: definition(
    "meals",
    "Today's Meals",
    "Saved meals and nutrition for today",
    ["food"],
    true,
  ),
  actions: definition(
    "actions",
    "Quick Actions",
    "Open your favorite logging flows",
    ["drafts"],
    false,
    { actions: ["Workout", "Food", "Fluids", "Weight"] },
  ),
  streaks: definition(
    "streaks",
    "Streaks",
    "Optional logging and target consistency",
    ["streaks"],
    false,
    { habits: ["daily_logging", "training"] },
  ),
  calendar: definition(
    "calendar",
    "Calorie Calendar",
    "Browse daily calorie totals by month",
    ["calendar"],
    true,
  ),
  weight_trend: definition(
    "weight_trend",
    "Weight Trend",
    "Explore weight over time",
    ["vitals"],
    true,
  ),
  bp_trend: definition(
    "bp_trend",
    "Blood Pressure Trend",
    "Explore paired blood pressure over time",
    ["vitals"],
    true,
  ),
};
const widgetSchema = z.object({
  id: z.string().min(1),
  type: z.enum(Object.keys(registry) as [WidgetType, ...WidgetType[]]),
  size: z.enum(["small", "wide"]),
  config: z.record(z.string(), z.unknown()),
});
export const layoutSchema = z
  .object({ version: z.literal(1), widgets: z.array(widgetSchema).max(30) })
  .superRefine((layout, ctx) => {
    const keys = new Set<string>(),
      ids = new Set<string>();
    for (const widget of layout.widgets) {
      const config = registry[widget.type].schema.safeParse(widget.config);
      const key =
        widget.type === "streaks"
          ? `streaks:${[...((widget.config.habits as string[]) ?? [])].sort().join()}`
          : widget.type;
      if (
        !config.success ||
        !registry[widget.type].sizes.includes(widget.size) ||
        ids.has(widget.id) ||
        keys.has(key) ||
        (widget.type === "streaks" &&
          widget.size === "small" &&
          (widget.config.habits as string[])?.length !== 1) ||
        (widget.type === "actions" &&
          (widget.config.actions as string[])?.length !==
            (widget.size === "small"
              ? 2
              : Math.max(4, (widget.config.actions as string[])?.length)))
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid or duplicate widget configuration",
        });
      keys.add(key);
      ids.add(widget.id);
    }
  });
export type Layout = { version: 1; widgets: Widget[] };
export function defaultLayout(): Layout {
  const types: WidgetType[] = [
    "weight",
    "bp",
    "calories",
    "protein",
    "fluids",
    "calendar",
    "weight_trend",
    "bp_trend",
  ];
  return {
    version: 1,
    widgets: types.map((type, i) => ({
      id: `default-${type}`,
      type,
      size: i < 4 ? "small" : "wide",
      config: JSON.parse(JSON.stringify(registry[type].defaults)),
    })),
  };
}
export function readLayout(raw: string | null): {
  layout: Layout;
  recovered: boolean;
  migrated?: boolean;
} {
  if (raw === null) return { layout: defaultLayout(), recovered: false };
  try {
    const value = JSON.parse(raw);
    let migrated =
      value?.version === 1 &&
      Array.isArray(value.widgets) &&
      value.widgets.some((w: { type?: string } | null) => w?.type === "pr");
    // Retire only PR presentation, retaining every other ID, setting and position.
    if (value?.version === 1 && Array.isArray(value.widgets))
      value.widgets = value.widgets.filter(
        (w: { type?: string } | null) => w?.type !== "pr",
      );
    if (value?.version === 1 && Array.isArray(value.widgets)) {
      const seen = new Set<string>();
      value.widgets = value.widgets.flatMap((widget: { type?: string; config?: { habits?: unknown[] } } | null) => {
        if (widget?.type !== "streaks" || !Array.isArray(widget.config?.habits)) return [widget];
        const selected = widget.config.habits;
        const active = selected.filter((habit) => habit !== "food_complete");
        if (active.length !== selected.length) migrated = true;
        if (!active.length && selected.includes("food_complete")) return [];
        const key = [...active].sort().join();
        // Removal can make formerly distinct streak widgets identical.
        if (seen.has(key) && migrated) return [];
        seen.add(key);
        return [{ ...widget, config: { ...widget.config, habits: active } }];
      });
    }
    const parsed = layoutSchema.safeParse(value);
    if (parsed.success)
      return { layout: parsed.data as Layout, recovered: false, migrated };
  } catch {
    /* Preserve corrupt storage until an explicit save. */
  }
  return { layout: defaultLayout(), recovered: true };
}
export function packRows(widgets: Widget[], fullWidth: boolean): Widget[][] {
  const rows: Widget[][] = [];
  for (const widget of widgets) {
    const previous = rows.at(-1);
    if (
      !fullWidth &&
      widget.size === "small" &&
      previous?.length === 1 &&
      previous[0].size === "small"
    )
      previous.push(widget);
    else rows.push([widget]);
  }
  return rows;
}
export function moveWidget(
  widgets: Widget[],
  from: number,
  to: number,
): Widget[] {
  if (to < 0 || to >= widgets.length || from === to) return widgets;
  const next = [...widgets];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
