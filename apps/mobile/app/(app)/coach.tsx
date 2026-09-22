import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type {
  CoachActionPayload,
  CoachProfile,
} from "../../../../supabase/functions/_shared/coach";
import {
  workoutPlanIssue,
  workoutPreferencesSchema,
  type WorkoutPreferences,
} from "../../../../supabase/functions/_shared/workout-planning";
import { useAuth } from "../../src/features/auth/auth-provider";
import { WorkoutQuestionnaire } from "../../src/features/coach/workout-questionnaire";
import { applyCoachWorkout } from "../../src/features/coach/draft-actions";
import {
  getCoachProfile,
  saveCoachProfile,
  sendCoachMessage,
  updateCoachActionStatus,
} from "../../src/features/coach/repository";
import {
  loadWorkoutDraft,
  workoutDraftHasContent,
} from "../../src/features/training/workout-draft";
import {
  loadCardioDraft,
  cardioDraftHasContent,
} from "../../src/features/training/cardio-draft";
import { Pressable } from "../../src/ui/pressable";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { colors } from "../../src/ui/theme";

type Plan = {
  id: string;
  payload: Extract<CoachActionPayload, { kind: "next_workout" }>;
};
function localDate() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export default function WorkoutPlannerScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<CoachProfile>();
  const [preferences, setPreferences] = useState<WorkoutPreferences>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<Plan>();
  const [conflicts, setConflicts] = useState<string[]>([]);
  const request = useRef<AbortController | undefined>(undefined);
  const active = useRef(false);
  const applying = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const scrollToStep = useCallback(
    () => scroll.current?.scrollTo({ y: 0, animated: false }),
    [],
  );

  useFocusEffect(
    useCallback(() => {
      active.current = true;
      let current = true;
      setLoading(true);
      setError("");
      setNotice("");
      setPending(undefined);
      setPreferences(undefined);
      setProfile(undefined);
      setBusy(false);
      if (userId)
        void Promise.all([
          getCoachProfile(userId),
          AsyncStorage.getItem("healthapp:workout-preferences:" + userId),
        ])
          .then(([savedProfile, stored]) => {
            if (!current) return;
            setProfile(savedProfile);
            try {
              const parsed = workoutPreferencesSchema.safeParse(
                JSON.parse(stored ?? "null"),
              );
              if (parsed.success) {
                const value = { ...parsed.data };
                delete value.daysPerWeek;
                setPreferences({
                  ...value,
                  focus: [],
                  readiness: "ready",
                  equipment:
                    value.equipment.length > 1
                      ? value.equipment.filter((item) => item !== "bodyweight")
                      : value.equipment,
                });
              }
            } catch {
              /* Use defaults for obsolete preferences. */
            }
          })
          .catch((e: unknown) => {
            if (current)
              setError(
                e instanceof Error
                  ? e.message
                  : "Could not load planner preferences.",
              );
          })
          .finally(() => {
            if (current) setLoading(false);
          });
      else setLoading(false);
      return () => {
        current = false;
        active.current = false;
        request.current?.abort();
      };
    }, [userId]),
  );

  async function populate(plan: Plan) {
    if (!userId || applying.current) return;
    applying.current = true;
    setBusy(true);
    setError("");
    try {
      await applyCoachWorkout(userId, plan.payload, "replace");
      // Draft persistence is the success boundary; status bookkeeping must not cause duplicate generation.
      void updateCoachActionStatus(userId, plan.id, "applied").catch(
        () => undefined,
      );
      if (active.current) {
        setPending(undefined);
        router.replace({
          pathname: "/(app)/workout",
          params: {
            section:
              plan.payload.recommendation === "cardio" ? "cardio" : "lifting",
            planned: plan.payload.recommendation,
          },
        });
      }
    } catch (e) {
      if (active.current) {
        setPending(plan);
        setError(
          e instanceof Error
            ? e.message
            : "Could not fill your drafts. Try again.",
        );
      }
    } finally {
      applying.current = false;
      if (active.current) setBusy(false);
    }
  }

  async function generate(value: WorkoutPreferences) {
    if (!userId || busy) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setNotice("");
    setConflicts([]);
    setPreferences(value);
    try {
      const saved = await saveCoachProfile({
        ...profile,
        userId,
        goals: [
          ...new Set(
            value.goals.map((goal) =>
              goal === "strength_muscle"
                ? ("muscle_gain" as const)
                : ["endurance", "power"].includes(goal)
                  ? ("performance" as const)
                  : ("general_health" as const),
            ),
          ),
        ],
        experienceLevel: value.experience,
        // Legacy profile field only; not requested or used to size this session.
        trainingDaysPerWeek: profile?.trainingDaysPerWeek ?? 3,
        sessionMinutes: value.minutes,
        equipment: value.equipment,
        limitations: value.limitations,
        dietaryPreferences: profile?.dietaryPreferences ?? [],
        dietaryRestrictions: profile?.dietaryRestrictions ?? [],
        dislikedFoods: profile?.dislikedFoods ?? [],
        responseStyle: "concise",
        useNutrition: false,
        useTraining: true,
        useVitals: false,
        useHydration: false,
        usePhotoMetadata: false,
        consentedAt: new Date().toISOString(),
      });
      if (!active.current || controller.signal.aborted) return;
      setProfile(saved);
      await AsyncStorage.setItem(
        "healthapp:workout-preferences:" + userId,
        JSON.stringify(value),
      );
      const response = await sendCoachMessage(
        {
          workoutPreferences: value,
          message:
            "Generate one workout from my preferences and recent training as a structured next_workout action. Fill the appropriate lifting and cardio sections, sharing the total session time. I will edit the drafts in my log. Do not ask follow-up questions.",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          localDate: localDate(),
        },
        controller.signal,
      );
      if (!active.current || controller.signal.aborted) return;
      const action = response.actions.find(
        (item) => item.payload.kind === "next_workout",
      );
      if (response.safetyLevel !== "normal") {
        setNotice(response.answer);
        return;
      }
      if (!action || action.payload.kind !== "next_workout")
        throw new Error(
          "AI did not return a complete workout. Your draft was not changed. Try generating again.",
        );
      if (action.payload.recommendation === "rest") {
        setNotice(action.payload.rationale);
        return;
      }
      const issue = workoutPlanIssue(action.payload, value);
      if (issue)
        throw new Error(issue + " Adjust your preferences and generate again.");
      const plan: Plan = { id: action.id, payload: action.payload };
      const [lifting, cardio] = await Promise.all([
        loadWorkoutDraft(userId),
        loadCardioDraft(userId),
      ]);
      if (!active.current || controller.signal.aborted) return;
      const occupied = [
        ...(plan.payload.exercises.length &&
        lifting &&
        workoutDraftHasContent(lifting)
          ? ["Lifting"]
          : []),
        ...(plan.payload.cardio && cardio && cardioDraftHasContent(cardio)
          ? ["Cardio"]
          : []),
      ];
      setPending(plan);
      setConflicts(occupied);
      if (!occupied.length) await populate(plan);
    } catch (e) {
      if (active.current && !controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "Could not generate your workout. Try again.",
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }

  return (
    <ScreenScrollView ref={scroll} contentContainerStyle={styles.content}>
      <Text accessibilityRole="header" style={styles.title}>
        Plan a workout
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => router.replace("/(app)/workout")}
        style={styles.button}
      >
        <Text style={styles.link}>Back to Workout</Text>
      </Pressable>
      {loading ? (
        <ActivityIndicator accessibilityLabel="Loading workout planner" />
      ) : pending ? (
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.heading}>
            {conflicts.length
              ? "You already have unfinished drafts"
              : "Your plan is ready"}
          </Text>
          <Text style={styles.copy}>
            {conflicts.length
              ? "Replace your existing " +
                conflicts.join(" and ") +
                " draft with the new plan? You can edit every suggestion in the log."
              : "Fill your editable workout drafts with the generated plan."}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void populate(pending)}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>
              {busy
                ? "Filling drafts..."
                : conflicts.length
                  ? "Replace existing drafts"
                  : "Fill workout drafts"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => {
              setPending(undefined);
              setError("");
            }}
            style={styles.button}
          >
            <Text style={styles.link}>Keep existing drafts</Text>
          </Pressable>
        </View>
      ) : (
        <WorkoutQuestionnaire
          initial={preferences}
          profile={profile}
          busy={busy}
          onGenerate={generate}
          onStepChange={scrollToStep}
        />
      )}
      {busy ? (
        <ActivityIndicator accessibilityLabel="Generating workout drafts" />
      ) : null}
      {notice ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {notice}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </ScreenScrollView>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 50,
    gap: 14,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 28, fontWeight: "700", color: colors.text },
  heading: { fontSize: 20, fontWeight: "600", color: colors.text },
  card: { gap: 14 },
  copy: { fontSize: 15, lineHeight: 22, color: colors.secondary },
  button: { minHeight: 44, justifyContent: "center" },
  link: { color: colors.blue, fontSize: 16 },
  primary: {
    backgroundColor: colors.blue,
    minHeight: 48,
    borderRadius: 12,
    padding: 14,
    justifyContent: "center",
  },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  error: { color: colors.danger, fontSize: 15 },
});
