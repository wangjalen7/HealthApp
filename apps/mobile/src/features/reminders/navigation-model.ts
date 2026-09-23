import { z } from "zod";
export const intentLifetimeMs = 30 * 60 * 1000;
const base = { v: z.literal(2), userId: z.string().min(1).max(100) };
const payloadSchema = z.discriminatedUnion("source", [
  z.object({
    ...base,
    source: z.literal("custom"),
    reminderId: z.string().min(1).max(100),
  }),
  z.object({
    ...base,
    source: z.literal("routine"),
    category: z.enum([
      "meals",
      "fluids",
      "blood_pressure",
      "weight",
      "workout",
    ]),
    slot: z.string().min(1).max(50),
  }),
]);
export type NotificationPayload = z.infer<typeof payloadSchema>;
export type NotificationTap = { key: string; data: unknown };
export type PendingIntent = {
  key: string;
  payload: NotificationPayload;
  expiresAt: number;
};
export type IntentState = { pending?: PendingIntent; seen: string[] };
export function captureIntent(
  state: IntentState,
  tap: NotificationTap,
  now: number,
): IntentState {
  if (
    !tap.key ||
    tap.key.length > 500 ||
    state.seen.includes(tap.key) ||
    state.pending?.key === tap.key
  )
    return state;
  const parsed = payloadSchema.safeParse(tap.data);
  if (!parsed.success) return state;
  if (
    parsed.data.source === "routine" &&
    parsed.data.category === "meals" &&
    !["breakfast", "lunch", "dinner"].includes(parsed.data.slot)
  )
    return state;
  return {
    pending: {
      key: tap.key,
      payload: parsed.data,
      expiresAt: now + intentLifetimeMs,
    },
    seen: [...state.seen, ...(state.pending ? [state.pending.key] : [])].slice(
      -100,
    ),
  };
}
export function clearIntent(state: IntentState): IntentState {
  return {
    seen: [...state.seen, ...(state.pending ? [state.pending.key] : [])].slice(
      -100,
    ),
  };
}
export function intentDecision(
  state: IntentState,
  auth: { userId?: string; loading: boolean; locked: boolean; ready: boolean },
  now: number,
): "wait" | "clear" | "navigate" {
  const p = state.pending;
  if (!p) return "wait";
  if (p.expiresAt <= now) return "clear";
  if (auth.loading) return "wait";
  if (auth.userId && auth.userId !== p.payload.userId) return "clear";
  if (!auth.userId || auth.locked || !auth.ready) return "wait";
  return "navigate";
}
export function intentDestination(p: NotificationPayload) {
  if (p.source === "custom")
    return {
      pathname: "/(app)/reminders" as const,
      params: { reminder: p.reminderId },
    };
  if (p.category === "meals")
    return {
      pathname: "/(app)/nutrition" as const,
      params: { routineMeal: p.slot },
    };
  const paths = {
    fluids: "/(app)/water",
    blood_pressure: "/(app)/track",
    weight: "/(app)/weight",
    workout: "/(app)/workout",
  } as const;
  return {
    pathname: paths[p.category],
    params: p.category === "workout" ? { routineWorkout: "true" } : {},
  };
}
