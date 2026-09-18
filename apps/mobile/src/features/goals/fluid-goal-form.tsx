import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors } from "../../ui/profile-theme";
import {
  calculateFluidGoal,
  fluidActivities,
  type FluidActivity,
  fluidOuncesToMilliliters,
  millilitersToFluidOunces,
  type EnergyEquationSex,
} from "./calculator";

export function FluidGoalForm({
  savedGoalMl,
  onUse,
}: {
  savedGoalMl?: number;
  onUse: (ml: number, calculation: Record<string, unknown>) => Promise<void>;
}) {
  const [mode, setMode] = useState("suggested");
  const [sex, setSex] = useState<EnergyEquationSex>();
  const [unit, setUnit] = useState("fl_oz");
  const [customMl, setCustomMl] = useState(savedGoalMl);
  const [custom, setCustom] = useState(
    savedGoalMl ? millilitersToFluidOunces(savedGoalMl).toFixed(1) : "",
  );
  const [activity, setActivity] = useState<FluidActivity>();
  const [preview, setPreview] = useState<{
    ml: number;
    calculation: Record<string, unknown>;
  }>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  function reset() {
    setPreview(undefined);
    setError("");
  }
  function value(text: string) {
    return text.trim() ? Number(text.replace(",", ".")) : Number.NaN;
  }
  function calculate() {
    reset();
    try {
      const input =
        mode === "custom"
          ? { mode: "custom" as const, customMl }
          : {
              mode: "suggested" as const,
              sex,
              activity,
            };
      const ml = calculateFluidGoal(input);
      setPreview({
        ml,
        calculation: {
          method: "beverage_activity_goal_v2",
          ...input,
          acceptedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the amounts.");
    }
  }
  const field = (
    label: string,
    text: string,
    setter: (text: string) => void,
  ) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        value={text}
        onChangeText={(next) => {
          setter(next);
          reset();
        }}
        style={styles.input}
      />
    </View>
  );
  const choice = (
    items: [string, string][],
    selected: string | undefined,
    setter: (value: string) => void,
  ) => (
    <View style={styles.choices}>
      {items.map(([id, label]) => (
        <Pressable
          key={id}
          accessibilityRole="radio"
          accessibilityLabel={label}
          accessibilityState={{ checked: selected === id }}
          onPress={() => {
            setter(id);
            reset();
          }}
          style={[styles.choice, selected === id && styles.selected]}
        >
          <Text style={styles.label}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View>
      <Text accessibilityRole="header" style={styles.title}>
        Find a daily fluid goal
      </Text>
      <Text style={styles.copy}>
        A flexible beverage starting goal. Food water is already accounted for;
        this does not measure your hydration status.
      </Text>
      {choice(
        [
          ["suggested", "Suggested goal"],
          ["custom", "Custom goal"],
        ],
        mode,
        setMode,
      )}
      {choice(
        [
          ["fl_oz", "US fl oz"],
          ["ml", "Milliliters"],
        ],
        unit,
        (next) => {
          setUnit(next);
          if (customMl !== undefined && Number.isFinite(customMl))
            setCustom(
              next === "ml"
                ? String(customMl)
                : millilitersToFluidOunces(customMl).toFixed(1),
            );
        },
      )}
      {mode === "custom" ? (
        <>
          {field(
            `Custom beverage goal (${unit === "ml" ? "mL" : "US fl oz"})`,
            custom,
            (text) => {
              setCustom(text);
              const n = value(text);
              setCustomMl(unit === "ml" ? n : fluidOuncesToMilliliters(n));
            },
          )}
          <Text style={styles.copy}>
            Use your preferred or clinician-directed goal. Exercise allowances
            are not added.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>What is your sex?</Text>
          {choice(
            [
              ["female", "Women"],
              ["male", "Men"],
            ],
            sex,
            (next) => setSex(next as EnergyEquationSex),
          )}
          <Text style={styles.copy}>
            About 2.2 L for women or 3.0 L for men from beverages. These are
            population references, not individual minimums. For a prescribed
            fluid limit, use Custom goal.
          </Text>
          <Text style={styles.label}>How active are you on a typical day?</Text>
          {choice(
            fluidActivities.map((item) => [item.id, item.label]),
            activity,
            (next) => setActivity(next as FluidActivity),
          )}
          <Text style={styles.copy}>
            {fluidActivities.find((item) => item.id === activity)?.detail ??
              "Choose the description that fits most days."}
          </Text>
          <Text style={styles.copy}>
            Activity adds a small planning allowance. This is an adjustable
            starting goal, not a measurement of your needs. Adjust to thirst and
            extra sweating.
          </Text>
        </>
      )}
      <Pressable
        accessibilityRole="button"
        onPress={calculate}
        disabled={saving}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Calculate fluid goal</Text>
      </Pressable>
      {preview ? (
        <View style={styles.preview}>
          <Text style={styles.title}>
            {unit === "ml"
              ? `About ${Math.round(preview.ml).toLocaleString()} mL/day`
              : `About ${Math.round(millilitersToFluidOunces(preview.ml))} US fl oz/day`}
          </Text>
          <Text style={styles.copy}>
            {Math.round(preview.ml).toLocaleString()} mL ·{" "}
            {mode === "custom"
              ? "Your custom goal"
              : "Adjustable starting estimate"}
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={saving}
            style={styles.button}
            onPress={async () => {
              setSaving(true);
              setError("");
              try {
                await onUse(preview.ml, {
                  ...preview.calculation,
                  acceptedAt: new Date().toISOString(),
                });
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Could not save the goal.",
                );
              } finally {
                setSaving(false);
              }
            }}
          >
            <Text style={styles.buttonText}>
              {saving ? "Saving..." : "Use this goal"}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.copy}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  title: {
    fontSize: 23,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  copy: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.secondary,
    marginBottom: 16,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginVertical: 12,
  },
  choice: {
    minHeight: 44,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    justifyContent: "center",
  },
  selected: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  field: { marginBottom: 14, gap: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    fontSize: 17,
  },
  button: {
    minHeight: 48,
    backgroundColor: colors.blue,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  preview: { marginTop: 16 },
});
