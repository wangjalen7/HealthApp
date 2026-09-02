import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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

const units: HydrationUnit[] = ["fl_oz", "ml", "cup"];
const quickOunces = [8, 12, 16, 20, 24];

export default function WaterScreen() {
  const { session } = useAuth();
  const [fluidName, setFluidName] = useState("Water");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<HydrationUnit>("fl_oz");
  const [todayMl, setTodayMl] = useState(0);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setTodayMl(await getTodayHydrationMl(session.user.id));
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Water & fluids</Text>
      <Text style={styles.copy}>
        Log water and other drinks toward your daily hydration goal.
      </Text>
      <View style={styles.todayCard}>
        <Text style={styles.todayLabel}>TODAY</Text>
        <Text style={styles.todayValue}>{mlToFluidOunces(todayMl)} fl oz</Text>
        <Text style={styles.todayDetail}>{Math.round(todayMl)} mL</Text>
      </View>
      <Text style={styles.label}>Quick water amount</Text>
      <View style={styles.chips}>
        {quickOunces.map((ounces) => (
          <Pressable
            key={ounces}
            onPress={() => {
              setFluidName("Water");
              setAmount(String(ounces));
              setUnit("fl_oz");
            }}
            style={styles.quickChip}
          >
            <Text style={styles.quickText}>{ounces} fl oz</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Fluid</Text>
      <TextInput
        accessibilityLabel="Fluid name"
        maxLength={80}
        onChangeText={setFluidName}
        placeholder="Water"
        placeholderTextColor="#9FB3C8"
        style={styles.input}
        value={fluidName}
      />
      <Text style={styles.label}>Amount</Text>
      <TextInput
        accessibilityLabel="Fluid amount"
        keyboardType="decimal-pad"
        onChangeText={setAmount}
        placeholder="0"
        placeholderTextColor="#9FB3C8"
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { backgroundColor: "#F7FAFC", flexGrow: 1, padding: 20 },
  title: { color: "#102A43", fontSize: 30, fontWeight: "800" },
  copy: { color: "#627D98", lineHeight: 21, marginBottom: 18, marginTop: 7 },
  todayCard: {
    backgroundColor: "#DFF4FF",
    borderRadius: 16,
    marginBottom: 20,
    padding: 17,
  },
  todayLabel: {
    color: "#16776A",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  todayValue: {
    color: "#102A43",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 4,
  },
  todayDetail: { color: "#627D98", marginTop: 3 },
  label: { color: "#486581", fontSize: 13, fontWeight: "800", marginBottom: 7 },
  input: {
    backgroundColor: "#fff",
    borderColor: "#D9E2EC",
    borderRadius: 12,
    borderWidth: 1,
    color: "#102A43",
    fontSize: 17,
    marginBottom: 16,
    minHeight: 50,
    padding: 13,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 17 },
  quickChip: {
    backgroundColor: "#DFF4FF",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  quickText: { color: "#126B83", fontWeight: "800" },
  unitChip: {
    backgroundColor: "#E6EEF3",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  unitChipActive: { backgroundColor: "#16776A" },
  unitText: { color: "#486581", fontWeight: "800" },
  unitTextActive: { color: "#fff", fontWeight: "800" },
  success: { color: "#16776A", fontWeight: "700", marginBottom: 10 },
  error: { color: "#B42318", lineHeight: 20, marginBottom: 10 },
  button: {
    alignItems: "center",
    backgroundColor: "#16776A",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 54,
  },
  disabled: { opacity: 0.65 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
