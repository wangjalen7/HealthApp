import { EntryDateField } from "../../src/ui/entry-date-field";
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
  hydrationInputSchema,
  hydrationUnitLabel,
  mlToFluidOunces,
  type HydrationUnit,
} from "../../src/features/hydration/model";
import {
  getTodayHydrationTotals,
  getHydrationHistory,
  type HydrationHistoryEntry,
  saveHydration,
} from "../../src/features/hydration/repository";

import { getDailyGoals } from "../../src/features/goals/repository";
import { WaterGlass } from "../../src/features/hydration/water-glass";

import { DrinkSelector } from "../../src/features/hydration/drink-selector";
import { ClassifyDrink } from "../../src/features/hydration/classify-drink";
import {
  getDrinkCategory,
  type DrinkCategoryId,
  type AlcoholStatus,
} from "../../src/features/hydration/categories";

const units: HydrationUnit[] = ["fl_oz", "ml", "cup"];
const quickOunces = [8, 12, 16, 20, 24, 40];

export default function WaterScreen() {
  const { session } = useAuth();
  const [entryDay, setEntryDay] = useState<string>();
  const [fluidName, setFluidName] = useState("");
  const [categoryId, setCategoryId] = useState<DrinkCategoryId>();
  const [alcoholStatus, setAlcoholStatus] =
    useState<AlcoholStatus>("nonalcoholic");
  const [recent, setRecent] = useState<HydrationHistoryEntry[]>([]);
  const [alcoholMl, setAlcoholMl] = useState(0);
  const [pendingMl, setPendingMl] = useState(0);
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<HydrationUnit>("fl_oz");
  const [todayMl, setTodayMl] = useState(0);
  const [goalMl, setGoalMl] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [total, goals, history] = await Promise.all([
        getTodayHydrationTotals(session.user.id),
        getDailyGoals(session.user.id),
        getHydrationHistory(session.user.id),
      ]);
      setTodayMl(total.countedMl);
      setAlcoholMl(total.alcoholMl);
      setPendingMl(total.pendingMl);
      setRecent(history);
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
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return setFeedback("Enter an amount greater than zero.");
    }
    if (!categoryId) return setFeedback("Choose a drink category.");
    setSaving(true);
    setFeedback("");
    try {
      const input = {
        entryDay,
        fluidName: fluidName.trim() || getDrinkCategory(categoryId)!.label,
        amount: parsed,
        unit,
        categoryId,
        alcoholStatus,
      };
      const validation = hydrationInputSchema.safeParse(input);
      if (!validation.success) {
        setFeedback(validation.error.issues[0].message);
        return;
      }
      await saveHydration(session.user.id, input);
      setAmount("");
      setEntryDay(undefined);
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
      <Text accessibilityRole="header" style={styles.title}>
        Daily fluids
      </Text>
      <View style={styles.todayCard}>
        <WaterGlass value={todayMl} goal={goalMl} />
        <View style={{ flex: 1 }}>
          <Text style={styles.todayLabel}>TODAY</Text>
          <Text style={styles.todayValue}>
            {mlToFluidOunces(todayMl)} fl oz
          </Text>
          <Text style={styles.todayDetail}>
            {goalMl
              ? `of ${mlToFluidOunces(goalMl)} fl oz goal`
              : "Set a daily fluid goal in Profile"}
          </Text>
          {alcoholMl > 0 ? (
            <Text style={styles.todayDetail}>
              {mlToFluidOunces(alcoholMl)} fl oz alcohol logged separately
            </Text>
          ) : null}
          {pendingMl > 0 ? (
            <Text style={styles.todayDetail}>
              {mlToFluidOunces(pendingMl)} fl oz needs classification
            </Text>
          ) : null}
          {goalMl && todayMl >= goalMl ? (
            <Text style={styles.goalReached}>Daily goal reached</Text>
          ) : null}
        </View>
      </View>
      <EntryDateField
        value={entryDay}
        onChange={setEntryDay}
        disabled={saving}
      />
      <Text style={styles.label}>Quick fluid amount</Text>
      <View style={styles.chips}>
        {quickOunces.map((ounces) => (
          <Pressable
            key={ounces}
            accessibilityLabel={`${ounces} fluid ounces`}
            accessibilityRole="radio"
            accessibilityState={{
              checked: unit === "fl_oz" && Number(amount) === ounces,
            }}
            onPress={() => {
              setAmount(String(ounces));
              setUnit("fl_oz");
            }}
            style={[
              styles.quickChip,
              unit === "fl_oz" &&
                Number(amount) === ounces &&
                styles.unitChipActive,
            ]}
          >
            <Icon
              name="water"
              size={15}
              color={
                unit === "fl_oz" && Number(amount) === ounces
                  ? colors.onAccent
                  : colors.blue
              }
            />
            <Text
              style={[
                styles.quickText,
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
      {recent.some((entry) => entry.categoryId !== "legacy") ? (
        <>
          <Text style={styles.label}>Recent drinks</Text>
          <View style={styles.chips}>
            {recent
              .filter(
                (entry, index, all) =>
                  entry.categoryId !== "legacy" &&
                  all.findIndex(
                    (other) =>
                      other.fluidName === entry.fluidName &&
                      other.categoryId === entry.categoryId &&
                      other.alcoholStatus === entry.alcoholStatus,
                  ) === index,
              )
              .slice(0, 6)
              .map((entry) => (
                <Pressable
                  key={entry.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Use recent drink ${entry.fluidName}`}
                  onPress={() => {
                    const category = getDrinkCategory(entry.categoryId);
                    if (!category) return;
                    setFluidName(entry.fluidName);
                    setCategoryId(category.id);
                    setAlcoholStatus(
                      (entry.alcoholStatus as AlcoholStatus) ?? "unknown",
                    );
                    setUnit("ml");
                    setAmount(String(entry.volumeMl));
                  }}
                  style={styles.unitChip}
                >
                  <Text style={styles.unitText}>{entry.fluidName}</Text>
                </Pressable>
              ))}
          </View>
        </>
      ) : null}
      <DrinkSelector
        categoryId={categoryId}
        alcoholStatus={alcoholStatus}
        disabled={saving}
        onChange={(id, status) => {
          if (id !== categoryId)
            setFluidName(getDrinkCategory(id)?.label ?? "");
          setCategoryId(id);
          setAlcoholStatus(status);
          setFeedback("");
        }}
      />
      <Text style={styles.label}>Drink name (optional)</Text>
      <TextInput
        accessibilityLabel="Fluid name"
        maxLength={80}
        onChangeText={setFluidName}
        placeholder="Drink name"
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
            accessibilityLabel={hydrationUnitLabel[value]}
            accessibilityRole="radio"
            accessibilityState={{ checked: unit === value }}
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
          accessibilityLiveRegion="polite"
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
      {recent.filter((entry) => entry.countedMl === null).length ? (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.label}>Needs classification</Text>
          {recent
            .filter((entry) => entry.countedMl === null)
            .map((entry) => (
              <View key={entry.id}>
                <Text style={styles.unitText}>
                  {entry.fluidName} · {mlToFluidOunces(entry.volumeMl)} fl oz
                </Text>
                <ClassifyDrink entry={entry} onChanged={load} />
              </View>
            ))}
        </View>
      ) : null}
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
