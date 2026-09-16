import { trackingStyles } from "../../src/ui/tracking-styles";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { Icon } from "../../src/ui/icon";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "../../src/features/auth/auth-provider";
import {
  hydrationUnitLabel,
  mlToFluidOunces,
  type HydrationUnit,
} from "../../src/features/hydration/model";
import {
  getTodayHydrationMl,
  saveHydration,
} from "../../src/features/hydration/repository";

import { getDailyGoals } from "../../src/features/goals/repository";
import { WaterGlass } from "../../src/features/hydration/water-glass";

const units: HydrationUnit[] = ["fl_oz", "ml", "cup"];
const quickOunces = [8, 12, 16, 20, 24, 40];

export default function WaterScreen() {
  const { session } = useAuth();
  const [fluidName, setFluidName] = useState("Water");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<HydrationUnit>("fl_oz");
  const [todayMl, setTodayMl] = useState(0);
  const [goalMl, setGoalMl] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [total, goals] = await Promise.all([
        getTodayHydrationMl(session.user.id),
        getDailyGoals(session.user.id),
      ]);
      setTodayMl(total);
      setGoalMl(goals.waterGoalMl);
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not load hydration.",
      );
    }
  }, [session]);
  useFocusEffect(useCallback(() => void load(), [load]));

  async function save() {
    if (!session) return setFeedback("Please sign in before saving.");
    const parsed = Number(amount.replace(",", "."));
    if (!fluidName.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      return setFeedback("Enter a fluid name and an amount greater than zero.");
    }
    setSaving(true);
    setFeedback("");
    try {
      await saveHydration(session.user.id, {
        fluidName: fluidName.trim(),
        amount: parsed,
        unit,
      });
      setAmount("");
      setFeedback("Fluid saved.");
      await load();
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : "Could not save fluid.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScreenScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Water</Text>
      <View style={styles.todayCard}>
        <WaterGlass value={todayMl} goal={goalMl} />
        <View style={{ flex: 1 }}>
          <Text style={styles.todayLabel}>TODAY</Text>
          <Text style={styles.todayValue}>
            {mlToFluidOunces(todayMl)} fl oz
          </Text>
          <Text style={styles.todayDetail}>{Math.round(todayMl)} mL</Text>
          <Text style={styles.todayDetail}>
            {goalMl
              ? `of ${mlToFluidOunces(goalMl)} fl oz goal`
              : "Set a daily water goal in Profile"}
          </Text>
          {goalMl && todayMl >= goalMl ? (
            <Text style={styles.goalReached}>Daily goal reached</Text>
          ) : null}
        </View>
      </View>
      <Text style={styles.label}>Quick water amount</Text>
      <View style={styles.chips}>
        {quickOunces.map((ounces) => (
          <Pressable
            key={ounces}
            accessibilityState={{
              selected:
                fluidName === "Water" &&
                unit === "fl_oz" &&
                Number(amount) === ounces,
            }}
            onPress={() => {
              setFluidName("Water");
              setAmount(String(ounces));
              setUnit("fl_oz");
            }}
            style={[
              styles.quickChip,
              fluidName === "Water" &&
                unit === "fl_oz" &&
                Number(amount) === ounces &&
                styles.unitChipActive,
            ]}
          >
            <Icon
              name="water"
              size={15}
              color={
                fluidName === "Water" &&
                unit === "fl_oz" &&
                Number(amount) === ounces
                  ? "#fff"
                  : colors.blue
              }
            />
            <Text
              style={[
                styles.quickText,
                fluidName === "Water" &&
                  unit === "fl_oz" &&
                  Number(amount) === ounces &&
                  styles.unitTextActive,
              ]}
            >
              {ounces} fl oz
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Fluid</Text>
      <TextInput
        accessibilityLabel="Fluid name"
        maxLength={80}
        onChangeText={setFluidName}
        placeholder="Water"
        placeholderTextColor={colors.tertiary}
        style={styles.input}
        value={fluidName}
      />
      <Text style={styles.label}>Amount</Text>
      <TextInput
        accessibilityLabel="Fluid amount"
        keyboardType="decimal-pad"
        onChangeText={setAmount}
        placeholder="0"
        placeholderTextColor={colors.tertiary}
        style={styles.input}
        value={amount}
      />
      <View style={styles.chips}>
        {units.map((value) => (
          <Pressable
            accessibilityState={{ selected: unit === value }}
            key={value}
            onPress={() => setUnit(value)}
            style={[styles.unitChip, unit === value && styles.unitChipActive]}
          >
            <Text
              style={unit === value ? styles.unitTextActive : styles.unitText}
            >
              {hydrationUnitLabel[value]}
            </Text>
          </Pressable>
        ))}
      </View>
      {feedback ? (
        <Text
          style={feedback === "Fluid saved." ? styles.success : styles.error}
        >
          {feedback}
        </Text>
      ) : null}
      <Pressable
        disabled={saving}
        onPress={() => void save()}
        style={[styles.button, saving && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {saving ? "Saving..." : "Save fluid"}
        </Text>
      </Pressable>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  page: trackingStyles.page,
  title: trackingStyles.title,
  goalReached: {
    color: colors.blue,
    fontSize: 13,
    fontWeight: "600",
    marginTop: 8,
  },
  todayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    ...trackingStyles.card,
    marginBottom: 20,
  },
  todayLabel: {
    color: colors.blue,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
  },
  todayValue: {
    color: colors.text,
    fontSize: 27,
    fontWeight: "600",
    marginTop: 4,
  },
  todayDetail: { color: colors.secondary, marginTop: 3 },
  label: trackingStyles.label,
  input: { ...trackingStyles.input, marginBottom: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 17 },
  quickChip: {
    ...trackingStyles.chip,
    backgroundColor: colors.blueSoft,
    flexBasis: "30%",
    flexGrow: 1,
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 6,
  },
  quickText: { ...trackingStyles.chipText, color: colors.blue },
  unitChip: trackingStyles.chip,
  unitChipActive: trackingStyles.chipActive,
  unitText: trackingStyles.chipText,
  unitTextActive: trackingStyles.chipTextActive,
  success: trackingStyles.success,
  error: trackingStyles.error,
  button: trackingStyles.button,
  disabled: { opacity: 0.65 },
  buttonText: trackingStyles.buttonText,
});
