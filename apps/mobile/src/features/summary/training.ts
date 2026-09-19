import { dayKey, monday, shiftDay } from "./calendar";
export type LoggedSet = {
  id: string;
  session_id: string;
  exercise_name: string;
  muscle_group?: string | null;
  weight: number;
  weight_unit: string;
  reps: number;
  side_mode?: string;
  right_weight?: number | null;
  right_reps?: number | null;
  set_number: number;
};
export type LoggedSession = {
  id: string;
  completed_at: string;
  title?: string;
};
export type LoggedCardio = {
  id: string;
  occurred_at: string;
  duration_minutes: number;
  deleted_at?: string | null;
  source?: string;
};
export const validPerformance = (weight: unknown, reps: unknown) =>
  weight !== null &&
  weight !== undefined &&
  Number.isFinite(Number(weight)) &&
  Number(weight) >= 0 &&
  Number.isInteger(Number(reps)) &&
  Number(reps) > 0;
export function validSet(set: LoggedSet): boolean {
  return (
    validPerformance(set.weight, set.reps) &&
    (set.side_mode !== "unilateral" ||
      validPerformance(set.right_weight, set.right_reps))
  );
}
export function trainingSummary(
  sessions: LoggedSession[],
  sets: LoggedSet[],
  cardio: LoggedCardio[],
  now: Date,
  period: "week" | "last7",
) {
  const today = dayKey(now),
    start = period === "week" ? monday(today) : shiftDay(today, -6),
    end = period === "week" ? shiftDay(start, 6) : today;
  const inRange = (at: string) =>
    Number.isFinite(Date.parse(at)) &&
    Date.parse(at) <= now.getTime() &&
    dayKey(new Date(at)) >= start &&
    dayKey(new Date(at)) <= end;
  const valid = sets.filter(validSet),
    savedIds = new Set(valid.map((s) => s.session_id));
  const lifting = sessions.filter(
    (s) => inRange(s.completed_at) && savedIds.has(s.id),
  );
  const liftingIds = new Set(lifting.map((s) => s.id));
  const logicalSets = valid.filter((s) => liftingIds.has(s.session_id));
  const activities = cardio.filter(
    (c) =>
      !c.deleted_at &&
      Number(c.duration_minutes) > 0 &&
      Number.isFinite(Number(c.duration_minutes)) &&
      inRange(c.occurred_at),
  );
  const days = new Set([
    ...lifting.map((s) => dayKey(new Date(s.completed_at))),
    ...activities.map((c) => dayKey(new Date(c.occurred_at))),
  ]);
  const groups: Record<string, number> = {};
  for (const set of logicalSets)
    groups[set.muscle_group || "Unassigned"] =
      (groups[set.muscle_group || "Unassigned"] ?? 0) + 1;
  return {
    start,
    end,
    lifting: lifting.length,
    cardio: activities.length,
    days: days.size,
    sets: logicalSets.length,
    minutes: activities.reduce((n, c) => n + Number(c.duration_minutes), 0),
    groups,
  };
}
export type PersonalRecord = {
  sessionId: string;
  at: string;
  name: string;
  type: "load" | "reps";
  side: "bilateral" | "left" | "right";
  value: number;
  previous: number;
  load: number;
  unit: string;
  reps: number;
  setNumber: number;
};
// Compatible kg/lb loads are compared at 0.01 kg precision. Names only normalize
// case and whitespace: equipment and punctuation remain part of identity.
export function personalRecords(
  sessions: LoggedSession[],
  sets: LoggedSet[],
): PersonalRecord[] {
  const history = new Map<
    string,
    { load: number; reps: Map<number, number> }
  >();
  const results: PersonalRecord[] = [];
  const bySession = new Map<string, LoggedSet[]>();
  for (const set of sets) {
    const list = bySession.get(set.session_id) ?? [];
    list.push(set);
    bySession.set(set.session_id, list);
  }
  // Equal completion timestamps share a baseline; ID order cannot invent an improvement.
  const times = new Map<string, LoggedSession[]>();
  for (const session of sessions.filter((s) =>
    Number.isFinite(Date.parse(s.completed_at)),
  )) {
    const list = times.get(session.completed_at) ?? [];
    list.push(session);
    times.set(session.completed_at, list);
  }
  for (const [at, group] of [...times].sort(([a], [b]) => a.localeCompare(b))) {
    const batch = new Map<
      string,
      { load: number; reps: Map<number, number> }
    >();
    for (const session of group.sort((a, b) => a.id.localeCompare(b.id))) {
      const candidates = new Map<string, PersonalRecord>();
      for (const set of (bySession.get(session.id) ?? []).sort(
        (a, b) => a.set_number - b.set_number || a.id.localeCompare(b.id),
      )) {
        if (!["kg", "lb"].includes(set.weight_unit)) continue;
        const factor = set.weight_unit === "lb" ? 0.45359237 : 1;
        const sides =
          set.side_mode === "unilateral"
            ? (["left", "right"] as const)
            : (["bilateral"] as const);
        for (const side of sides) {
          const load = side === "right" ? set.right_weight : set.weight,
            reps = side === "right" ? set.right_reps : set.reps;
          if (!validPerformance(load, reps)) continue;
          const kg = Math.round(Number(load) * factor * 100) / 100;
          const key = JSON.stringify([
            set.exercise_name.trim().toLowerCase().replace(/\s+/g, " "),
            set.muscle_group ?? "",
            side,
          ]);
          const old = history.get(key);
          const current = batch.get(key) ?? {
            load: -1,
            reps: new Map<number, number>(),
          };
          current.load = Math.max(current.load, kg);
          current.reps.set(
            kg,
            Math.max(current.reps.get(kg) ?? 0, Number(reps)),
          );
          batch.set(key, current);
          const base = {
            sessionId: session.id,
            at,
            name: set.exercise_name,
            side,
            load: Number(load),
            unit: set.weight_unit,
            reps: Number(reps),
            setNumber: set.set_number,
          };
          if (old && kg > old.load) {
            const record: PersonalRecord = {
              ...base,
              type: "load",
              value: Number(load),
              previous: Math.round((old.load / factor) * 100) / 100,
            };
            const id = key + ":load",
              previous = candidates.get(id);
            if (
              !previous ||
              kg >
                Math.round(
                  previous.load *
                    (previous.unit === "lb" ? 0.45359237 : 1) *
                    100,
                ) /
                  100
            )
              candidates.set(id, record);
          }
          const previousReps = old?.reps.get(kg);
          if (previousReps !== undefined && Number(reps) > previousReps) {
            const id = `${key}:reps:${kg}`,
              previous = candidates.get(id);
            if (!previous || Number(reps) > previous.value)
              candidates.set(id, {
                ...base,
                type: "reps",
                value: Number(reps),
                previous: previousReps,
              });
          }
        }
      }
      results.push(...candidates.values());
    }
    for (const [key, value] of batch) {
      const old = history.get(key);
      if (old) {
        value.load = Math.max(old.load, value.load);
        for (const [load, reps] of old.reps)
          value.reps.set(load, Math.max(reps, value.reps.get(load) ?? 0));
      }
      history.set(key, value);
    }
  }
  return results.sort(
    (a, b) =>
      b.at.localeCompare(a.at) ||
      a.sessionId.localeCompare(b.sessionId) ||
      a.name.localeCompare(b.name) ||
      a.type.localeCompare(b.type) ||
      a.side.localeCompare(b.side) ||
      a.setNumber - b.setNumber,
  );
}
