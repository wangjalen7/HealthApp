import { PrivacyBoundary } from "../../ui/privacy-boundary";
import { ContinueEntry } from "../auth/entry-provider";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../auth/auth-provider";
import { AccountContacts } from "../auth/account-contacts";
import { FaceIdSetup } from "../auth/face-id-setup";
import {
  getDailyGoals,
  saveDailyGoals,
  type DailyGoals,
} from "../goals/repository";
import { GoalHelper, type GoalHelperMode } from "../goals/goal-helper";
import {
  calorieDefaults,
  fluidDefaults,
  restoreCalorie,
  restoreFluid,
  displayNumber,
} from "../goals/helper-model";
import {
  poundsToKilograms,
  kilogramsToPounds,
  millilitersToFluidOunces,
} from "../goals/calculator";
import { useAccountSetup } from "./provider";
import { saveAccountSetup } from "./repository";
import {
  preferredName,
  defaultUnits,
  setupSteps,
  type SetupChanges,
} from "./model";
import { SetupLoading } from "./loading";
import { UnitChoices } from "./account-preferences";
import {
  SetupFrame,
  SetupButton,
  SetupField,
  SetupError,
  ui,
} from "./components";

export function OnboardingScreen() {
  const { session, biometricLocked, unlockWithFaceId, signOut } = useAuth();
  const { setup } = useAccountSetup();
  if (!session) return <Redirect href="/(auth)/sign-in" />;
  if (!setup) return <SetupLoading />;
  if (setup.completed_at) return <ContinueEntry />;
  return (
    <PrivacyBoundary
      locked={biometricLocked}
      lockScreen={
        <SetupFrame
          title="HealthApp is locked"
          copy="Unlock to continue your setup."
        >
          <SetupButton
            label="Unlock with Face ID"
            onPress={() => void unlockWithFaceId()}
          />
          <SetupButton
            label="Sign out"
            secondary
            onPress={() => void signOut()}
          />
        </SetupFrame>
      }
    >
      <Flow key={session.user.id} />
    </PrivacyBoundary>
  );
}
function Flow() {
  const { session } = useAuth();
  const { setup, accept, reload } = useAccountSetup();
  const userId = session!.user.id;
  const state = setup!;
  const [name, setName] = useState(
    state.preferred_name ??
      String(session?.user.user_metadata.first_name ?? ""),
  );
  const [units, setUnits] = useState(
    state.version === 1
      ? defaultUnits(Intl.DateTimeFormat().resolvedOptions().locale)
      : state.unit_system,
  );
  const [fluid, setFluid] = useState(
    state.version === 1 && units === "metric"
      ? ("ml" as const)
      : state.fluid_unit,
  );
  const [goals, setGoals] = useState<DailyGoals>(),
    [calories, setCalories] = useState(""),
    [protein, setProtein] = useState(""),
    [weight, setWeight] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [helper, setHelper] = useState<GoalHelperMode>(),
    [recovery, setRecovery] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false),
    active = useRef(true);
  const storage = useRef(Promise.resolve());
  const draftKey = "healthapp:onboarding-draft:" + userId;
  useEffect(() => {
    active.current = true;
    setReady(false);
    void (async () => {
      try {
        const saved = await getDailyGoals(userId);
        const raw = await AsyncStorage.getItem(draftKey);
        if (!active.current) return;
        setGoals(saved);
        setCalories(
          saved.calorieGoal === undefined ? "" : String(saved.calorieGoal),
        );
        setProtein(
          saved.proteinGoal === undefined ? "" : String(saved.proteinGoal),
        );
        setWeight(
          saved.weightGoalLb === undefined
            ? ""
            : String(
                units === "metric"
                  ? poundsToKilograms(saved.weightGoalLb)
                  : saved.weightGoalLb,
              ),
        );
        if (raw) {
          const draft = JSON.parse(raw);
          if (
            draft.version === state.version &&
            JSON.stringify(draft.baseline) === JSON.stringify(saved)
          ) {
            setName(draft.name);
            setUnits(draft.units);
            setFluid(draft.fluid);
            setCalories(draft.calories);
            setProtein(draft.protein);
            setWeight(draft.weight);
          } else {
            setName(state.preferred_name ?? "");
            setUnits(state.unit_system);
            setFluid(state.fluid_unit);
            setError(
              "Newer saved settings were loaded. Review them before continuing.",
            );
          }
        }
        setReady(true);
      } catch (e) {
        if (active.current)
          setError(
            e instanceof Error ? e.message : "Could not load your saved goals.",
          );
      }
    })();
    return () => {
      active.current = false;
    };
  }, [userId, loadRevision]);
  useEffect(() => {
    if (!ready || !goals) return;
    const value = JSON.stringify({
      version: state.version,
      baseline: goals,
      name,
      units,
      fluid,
      calories,
      protein,
      weight,
    });
    storage.current = storage.current
      .then(() => AsyncStorage.setItem(draftKey, value))
      .catch(() => {
        if (active.current)
          setError(
            "Could not save setup progress on this device. Keep the app open and retry.",
          );
      });
  }, [
    ready,
    state.version,
    goals,
    name,
    units,
    fluid,
    calories,
    protein,
    weight,
    draftKey,
  ]);
  async function perform(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      if (active.current)
        setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function move(step: typeof state.step, changes: SetupChanges = {}) {
    const next = await saveAccountSetup(state, { ...changes, step });
    if (active.current) accept(next);
  }
  async function persistGoals(
    next: DailyGoals,
    fields: ("calories" | "protein" | "weight")[] = [
      "calories",
      "protein",
      "weight",
    ],
  ) {
    const saved = await saveDailyGoals(userId, next, goals!);
    if (active.current) {
      setGoals(saved);
      if (fields.includes("calories"))
        setCalories(
          saved.calorieGoal === undefined ? "" : String(saved.calorieGoal),
        );
      if (fields.includes("protein"))
        setProtein(
          saved.proteinGoal === undefined ? "" : String(saved.proteinGoal),
        );
      if (fields.includes("weight"))
        setWeight(
          saved.weightGoalLb === undefined
            ? ""
            : String(
                units === "metric"
                  ? poundsToKilograms(saved.weightGoalLb)
                  : saved.weightGoalLb,
              ),
        );
    }
    return saved;
  }
  async function acceptSuggestedGoals(
    next: DailyGoals,
    fields: ("calories" | "protein" | "weight")[],
  ) {
    if (lock.current) throw Error("A save is already in progress.");
    lock.current = true;
    setBusy(true);
    try {
      return await persistGoals(next, fields);
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function next() {
    await perform(async () => {
      if (state.step === "name")
        await move("goals", {
          preferred_name: preferredName(name),
          unit_system: units,
          fluid_unit: fluid,
        });
      else if (state.step === "goals") {
        const updated = { ...goals! };
        if (calories.trim()) updated.calorieGoal = Number(calories);
        if (protein.trim()) updated.proteinGoal = Number(protein);
        if (weight.trim())
          updated.weightGoalLb =
            units === "metric"
              ? kilogramsToPounds(Number(weight))
              : Number(weight);
        if (updated.calorieGoal !== goals!.calorieGoal)
          delete updated.calorieCalculation;
        await persistGoals(updated);
        await move("fluids");
      } else if (state.step === "fluids") await move("convenience");
      else if (state.step === "convenience") await move("summary");
      else {
        await storage.current;
        const saved = await saveAccountSetup(state, { complete: true });
        await AsyncStorage.removeItem(draftKey);
        accept(saved);
      }
    });
  }
  const index = setupSteps.indexOf(state.step);
  const titles = {
    name: "Let’s make this yours.",
    goals: "Goals that fit your life.",
    fluids: "Make room for fluids.",
    convenience: "A little more convenient.",
    summary: state.preferred_name
      ? "You’re ready, " + state.preferred_name + "."
      : "You’re ready.",
  };
  const copies = {
    name: "A preferred name is enough. Choose units for your setup and goal estimates.",
    goals:
      "Set your own targets, or explore an editable estimate. Everything here is optional.",
    fluids:
      "Water and other beverages count toward your fluid goal. Food moisture stays separate.",
    convenience:
      "Choose what helps. You can change these choices later in Profile.",
    summary:
      "Here’s what is actually saved. You can edit any item before you start.",
  };
  const skip = () =>
    void perform(() => move(setupSteps[Math.min(index + 1, 4)]));
  const displayFluid =
    goals?.waterGoalMl === undefined
      ? "Set up later"
      : fluid === "ml"
        ? Math.round(goals.waterGoalMl) + " mL/day"
        : millilitersToFluidOunces(goals.waterGoalMl).toFixed(1) +
          " US fl oz/day";
  const calorieEstimate = goals
    ? restoreCalorie(
        goals.calorieCalculation,
        calorieDefaults(units, "maintain", undefined, goals.weightGoalLb),
        goals.calorieGoal,
      ).result
    : undefined;
  const fluidEstimate = goals
    ? restoreFluid(
        goals.fluidCalculation,
        fluidDefaults(fluid, goals.waterGoalMl),
        goals.waterGoalMl,
      ).result
    : undefined;
  return (
    <SetupFrame
      title={titles[state.step]}
      copy={copies[state.step]}
      step={index}
      back={
        index > 0
          ? () => void perform(() => move(setupSteps[index - 1]))
          : undefined
      }
      footer={
        <>
          <SetupButton
            label={
              busy
                ? "Saving..."
                : state.step === "summary"
                  ? "Start tracking"
                  : state.step === "goals"
                    ? "Save goals and continue"
                    : "Continue"
            }
            disabled={busy || !ready}
            onPress={() => void next()}
          />
          {state.step !== "summary" ? (
            <SetupButton
              label={state.step === "name" ? "Skip for now" : "Set up later"}
              secondary
              disabled={busy || !ready}
              onPress={skip}
            />
          ) : null}
        </>
      }
    >
      <SetupError message={error} />
      {error ? (
        <SetupButton
          label="Reload saved setup"
          secondary
          onPress={() =>
            void reload().then(() => setLoadRevision((v) => v + 1))
          }
        />
      ) : null}
      {!ready ? (
        <Text style={ui.copy}>Loading your saved settings...</Text>
      ) : state.step === "name" ? (
        <>
          <SetupField
            label="Preferred name"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <UnitChoices
            units={units}
            fluid={fluid}
            setUnits={(next) => {
              const amount = Number(weight);
              if (weight.trim() && Number.isFinite(amount) && next !== units)
                setWeight(
                  String(
                    next === "metric"
                      ? poundsToKilograms(amount)
                      : kilogramsToPounds(amount),
                  ),
                );
              setUnits(next);
            }}
            setFluid={setFluid}
          />
        </>
      ) : state.step === "goals" ? (
        <>
          <View style={ui.surface}>
            <Text style={ui.label}>Saved calorie goal</Text>
            <Text style={ui.value}>
              {goals?.calorieGoal === undefined
                ? "Not set"
                : goals.calorieGoal.toLocaleString() + " kcal/day"}
            </Text>
            {calorieEstimate ? (
              <Text style={ui.copy}>
                Last calculated estimate:{" "}
                {calorieEstimate.target.toLocaleString()} kcal/day. Review it
                before applying or recalculating.
              </Text>
            ) : null}
            <SetupButton
              label={
                calorieEstimate ? "Edit & Recalculate" : "Find My Calorie Goal"
              }
              secondary
              onPress={() => setHelper("calories")}
            />
          </View>
          <Text style={ui.caption}>
            Use the same saved estimates and target-date planning as Profile, or
            enter targets below. Calculation measurements do not add health
            readings.
          </Text>
          <SetupField
            label="Daily calories (kcal)"
            value={calories}
            onChangeText={setCalories}
            numeric
          />
          <SetupField
            label="Daily protein (g)"
            value={protein}
            onChangeText={setProtein}
            numeric
          />
          <SetupField
            label={"Target weight (" + (units === "metric" ? "kg" : "lb") + ")"}
            value={weight}
            onChangeText={setWeight}
            numeric
          />
          <Text style={ui.caption}>
            Leave any target empty to keep your saved value. No weight-loss goal
            is required.
          </Text>
        </>
      ) : state.step === "fluids" ? (
        <>
          <View style={ui.surface}>
            <Text style={ui.label}>Saved daily fluid goal</Text>
            <Text accessibilityLiveRegion="polite" style={ui.value}>
              {displayFluid}
            </Text>
            {fluidEstimate ? (
              <Text style={ui.copy}>
                Last calculated estimate:{" "}
                {fluid === "ml"
                  ? displayNumber(fluidEstimate.target, 0) + " mL/day"
                  : displayNumber(
                      millilitersToFluidOunces(fluidEstimate.target),
                      1,
                    ) + " US fl oz/day"}
                . Your saved estimate and applied goal are separate.
              </Text>
            ) : null}
            <SetupButton
              label={
                fluidEstimate ? "Edit & Recalculate" : "Find My Fluid Goal"
              }
              secondary
              onPress={() => setHelper("fluids")}
            />
          </View>
          <Text style={ui.caption}>
            Choose Suggested or Custom in the helper. Review your result, then
            use it when you're ready. Your edits and calculations are kept for
            later.
          </Text>
        </>
      ) : state.step === "convenience" ? (
        <>
          <FaceIdSetup />
          {!session?.user.email_confirmed_at ? (
            <>
              <SetupButton
                label={recovery ? "Not now" : "Add a recovery email"}
                secondary
                onPress={() => setRecovery(!recovery)}
              />
              {recovery ? <AccountContacts recoveryOnly /> : null}
            </>
          ) : null}
          <View style={ui.surface}>
            <Text style={ui.label}>Reminders when you want them</Text>
            <Text style={ui.copy}>
              After setup, open Reminders in Profile to choose routine or custom
              reminders. Notification permission is requested only when you
              enable one.
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={ui.surface}>
            <Text style={ui.label}>Personal details</Text>
            <Text style={ui.copy}>
              {state.preferred_name || "Name · Set up later"} ·{" "}
              {state.unit_system === "metric" ? "kg / cm" : "lb / ft / in"}
            </Text>
            <SetupButton
              label="Edit name and units"
              secondary
              onPress={() => void perform(() => move("name"))}
            />
          </View>
          <View style={ui.surface}>
            <Text style={ui.label}>Goals</Text>
            <Text style={ui.copy}>
              Calories:{" "}
              {goals?.calorieGoal === undefined
                ? "Set up later"
                : goals.calorieGoal + " kcal/day"}
              {"\n"}Protein:{" "}
              {goals?.proteinGoal === undefined
                ? "Set up later"
                : goals.proteinGoal + " g/day"}
              {"\n"}Weight:{" "}
              {goals?.weightGoalLb === undefined
                ? "Set up later"
                : units === "metric"
                  ? poundsToKilograms(goals.weightGoalLb).toFixed(1) + " kg"
                  : goals.weightGoalLb + " lb"}
            </Text>
            <SetupButton
              label="Edit goals"
              secondary
              onPress={() => void perform(() => move("goals"))}
            />
          </View>
          <View style={ui.surface}>
            <Text style={ui.label}>Fluids</Text>
            <Text style={ui.value}>{displayFluid}</Text>
            <SetupButton
              label="Edit fluid target"
              secondary
              onPress={() => void perform(() => move("fluids"))}
            />
          </View>
        </>
      )}
      <GoalHelper
        onGoalsChange={setGoals}
        visible={Boolean(helper)}
        defaultUnitSystem={units}
        defaultFluidUnit={fluid}
        defaultIntent="maintain"
        initialMode={helper ?? "calories"}
        savedWaterGoalMl={goals?.waterGoalMl}
        savedWeightGoalLb={goals?.weightGoalLb}
        onClose={() => setHelper(undefined)}
        onUseCalories={async (
          calorieGoal,
          weightGoalLb,
          calorieCalculation,
        ) => {
          await acceptSuggestedGoals(
            {
              ...goals!,
              calorieGoal,
              weightGoalLb: weightGoalLb ?? goals?.weightGoalLb,
              calorieCalculation,
            },
            weightGoalLb === undefined ? ["calories"] : ["calories", "weight"],
          );
          setHelper(undefined);
        }}
        onUseFluid={async (waterGoalMl, fluidCalculation) => {
          await acceptSuggestedGoals(
            {
              ...goals!,
              waterGoalMl,
              fluidCalculation,
            },
            [],
          );
          setHelper(undefined);
        }}
      />
    </SetupFrame>
  );
}
