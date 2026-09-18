import { fluidTotals } from "./hydration.ts";
type Row = Record<string, unknown>;

const number = (value: unknown) =>
  typeof value === "number" ? value : Number(value ?? 0);
const dateMs = (value: unknown) => new Date(String(value)).getTime();
const within = (value: unknown, days: number, now: Date) =>
  dateMs(value) >= now.getTime() - days * 86_400_000;
const average = (values: number[]) =>
  values.length
    ? Math.round(
        (values.reduce((sum, value) => sum + value, 0) / values.length) * 10,
      ) / 10
    : null;

export type CoachContextInput = {
  profile: Row | null;
  coachProfile: Row;
  nutrition: Row[];
  hydration: Row[];
  vitals: Row[];
  workouts: Row[];
  sets: Row[];
  cardio: Row[];
  photos: Row[];
  localDate: string;
  timezone?: string;
  now?: Date;
};

export function localDayForTimezone(value: unknown, timezone = "UTC") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(String(value)));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function timezoneOffsetMs(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const numberPart = (type: string) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  const represented = Date.UTC(
    numberPart("year"),
    numberPart("month") - 1,
    numberPart("day"),
    numberPart("hour"),
    numberPart("minute"),
    numberPart("second"),
  );
  return represented - at;
}

function localMidnightUtc(date: string, timezone: string) {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const first = guess - timezoneOffsetMs(guess, timezone);
  return (
    first -
    (timezoneOffsetMs(first, timezone) - timezoneOffsetMs(guess, timezone))
  );
}

export function utcBoundsForLocalDay(date: string, timezone: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDate = next.toISOString().slice(0, 10);
  return {
    start: new Date(localMidnightUtc(date, timezone)).toISOString(),
    end: new Date(localMidnightUtc(nextDate, timezone)).toISOString(),
  };
}

export function buildCoachSnapshot(input: CoachContextInput) {
  const now = input.now ?? new Date();
  const enabled = {
    nutrition: input.coachProfile.use_nutrition !== false,
    training: input.coachProfile.use_training !== false,
    vitals: input.coachProfile.use_vitals !== false,
    hydration: input.coachProfile.use_hydration !== false,
    photoMetadata: input.coachProfile.use_photo_metadata !== false,
  };
  const todayNutrition = enabled.nutrition
    ? input.nutrition.filter(
        (row) =>
          localDayForTimezone(row.occurred_at, input.timezone) ===
          input.localDate,
      )
    : [];
  const todayHydration = enabled.hydration
    ? input.hydration.filter(
        (row) =>
          localDayForTimezone(row.occurred_at, input.timezone) ===
          input.localDate,
      )
    : [];
  const weights = enabled.vitals
    ? input.vitals
        .filter((row) => row.kind === "weight" && !row.deleted_at)
        .map((row) => ({
          at: String(row.occurred_at),
          lb:
            row.unit === "kg" ? number(row.value) * 2.20462 : number(row.value),
        }))
        .sort((left, right) => right.at.localeCompare(left.at))
    : [];
  const weightAverage = (days: number) =>
    average(
      weights.filter((row) => within(row.at, days, now)).map((row) => row.lb),
    );
  const recentWorkouts = enabled.training
    ? input.workouts.filter((row) => within(row.completed_at, 28, now))
    : [];
  const recentIds = new Set(recentWorkouts.map((row) => String(row.id)));
  const recentSets = input.sets.filter((row) =>
    recentIds.has(String(row.session_id)),
  );
  const muscleSets: Record<string, number> = {};
  const exerciseBest: Record<string, { weightLb: number; reps: number }> = {};
  const completedBySession = new Map(
    recentWorkouts.map((row) => [String(row.id), String(row.completed_at)]),
  );
  const performanceByExercise = new Map<
    string,
    Map<string, { at: string; weightLb: number; reps: number }>
  >();
  for (const row of recentSets) {
    const group = String(row.muscle_group ?? "Unassigned");
    muscleSets[group] = (muscleSets[group] ?? 0) + 1;
    const name = String(row.exercise_name);
    const weightLb =
      row.weight_unit === "kg"
        ? number(row.weight) * 2.20462
        : number(row.weight);
    const current = exerciseBest[name];
    if (
      !current ||
      weightLb > current.weightLb ||
      (weightLb === current.weightLb && number(row.reps) > current.reps)
    )
      exerciseBest[name] = {
        weightLb: Math.round(weightLb * 10) / 10,
        reps: number(row.reps),
      };
    const sessions = performanceByExercise.get(name) ?? new Map();
    const sessionId = String(row.session_id);
    const sessionBest = sessions.get(sessionId);
    if (
      !sessionBest ||
      weightLb > sessionBest.weightLb ||
      (weightLb === sessionBest.weightLb && number(row.reps) > sessionBest.reps)
    )
      sessions.set(sessionId, {
        at: completedBySession.get(sessionId) ?? "",
        weightLb: Math.round(weightLb * 10) / 10,
        reps: number(row.reps),
      });
    performanceByExercise.set(name, sessions);
  }
  const exerciseProgression = Object.fromEntries(
    [...performanceByExercise.entries()].flatMap(([name, sessions]) => {
      const recent = [...sessions.values()].sort((left, right) =>
        right.at.localeCompare(left.at),
      );
      if (recent.length < 2) return [];
      const [latest, previous] = recent;
      const direction =
        latest.weightLb > previous.weightLb ||
        (latest.weightLb === previous.weightLb && latest.reps > previous.reps)
          ? "progressed"
          : latest.weightLb === previous.weightLb &&
              latest.reps === previous.reps
            ? "held"
            : "lower";
      return [[name, { latest, previous, direction }]];
    }),
  );
  const bp = enabled.vitals
    ? input.vitals
        .filter(
          (row) =>
            ["systolic_bp", "diastolic_bp", "pulse"].includes(
              String(row.kind),
            ) && !row.deleted_at,
        )
        .sort((left, right) =>
          String(right.occurred_at).localeCompare(String(left.occurred_at)),
        )
        .slice(0, 12)
        .map((row) => ({
          kind: row.kind,
          value: number(row.value),
          unit: row.unit,
          at: row.occurred_at,
        }))
    : [];
  return {
    localDate: input.localDate,
    goals: input.profile
      ? {
          calories: enabled.nutrition
            ? (input.profile.daily_calorie_goal ?? null)
            : null,
          proteinGrams: enabled.nutrition
            ? (input.profile.daily_protein_goal ?? null)
            : null,
          waterMl: enabled.hydration
            ? (input.profile.daily_water_goal_ml ?? null)
            : null,
          weightLb: enabled.vitals
            ? (input.profile.weight_goal_lb ?? null)
            : null,
        }
      : null,
    coachProfile: {
      goals:
        Array.isArray(input.coachProfile.goals) &&
        input.coachProfile.goals.length
          ? input.coachProfile.goals
          : [input.coachProfile.primary_goal],
      experienceLevel: input.coachProfile.experience_level,
      trainingDaysPerWeek: input.coachProfile.training_days_per_week,
      sessionMinutes: input.coachProfile.session_minutes,
      equipment: input.coachProfile.equipment ?? [],
      limitations: input.coachProfile.limitations ?? null,
      dietaryPreferences: input.coachProfile.dietary_preferences ?? [],
      dietaryRestrictions: input.coachProfile.dietary_restrictions ?? [],
      dislikedFoods: input.coachProfile.disliked_foods ?? [],
      mealPrepMinutes: input.coachProfile.meal_prep_minutes ?? null,
      responseStyle: input.coachProfile.response_style,
    },
    today: {
      calories: todayNutrition.reduce(
        (sum, row) => sum + number(row.calories),
        0,
      ),
      proteinGrams:
        Math.round(
          todayNutrition.reduce(
            (sum, row) => sum + number(row.protein_grams),
            0,
          ) * 10,
        ) / 10,
      hydrationMl: fluidTotals(
        todayHydration.map((row) => ({ ...row, volume_ml: row.volume_ml })),
      ).countedMl,
      hydrationPendingMl: fluidTotals(
        todayHydration.map((row) => ({ ...row, volume_ml: row.volume_ml })),
      ).pendingMl,
      alcoholBeverageMl: fluidTotals(
        todayHydration.map((row) => ({ ...row, volume_ml: row.volume_ml })),
      ).alcoholMl,
      foodsLogged: todayNutrition.length,
    },
    weight: enabled.vitals
      ? {
          latestLb: weights[0] ? Math.round(weights[0].lb * 10) / 10 : null,
          average7dLb: weightAverage(7),
          average30dLb: weightAverage(30),
          average90dLb: weightAverage(90),
          allTimeEntries: weights.length,
          firstAt: weights.at(-1)?.at ?? null,
          latestAt: weights[0]?.at ?? null,
        }
      : null,
    training28d: enabled.training
      ? {
          sessions: recentWorkouts.length,
          setsByMuscle: muscleSets,
          strongestRecentSets: exerciseBest,
          latestVsPriorSession: exerciseProgression,
        }
      : null,
    cardio28d: enabled.training
      ? {
          sessions: input.cardio.filter(
            (row) => !row.deleted_at && within(row.occurred_at, 28, now),
          ).length,
          minutes: input.cardio
            .filter(
              (row) => !row.deleted_at && within(row.occurred_at, 28, now),
            )
            .reduce((sum, row) => sum + number(row.duration_minutes), 0),
        }
      : null,
    recentVitals: bp,
    progressPhotoMetadata: enabled.photoMetadata
      ? {
          count: input.photos.length,
          latestAt: input.photos[0]?.taken_at ?? null,
        }
      : null,
    dataRanges: {
      nutritionEntries: enabled.nutrition ? input.nutrition.length : 0,
      workoutSessions: enabled.training ? input.workouts.length : 0,
      cardioEntries: enabled.training ? input.cardio.length : 0,
    },
  };
}
