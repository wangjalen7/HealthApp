import { useEffect, useState } from "react";
import { Keyboard, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardInputScope } from "../../ui/keyboard-input-scope";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { Icon } from "../../ui/icon";
import { colors } from "../../ui/profile-theme";
import { useAuth } from "../auth/auth-provider";
import { FluidGoalForm } from "./fluid-goal-form";
import { CalorieGoalForm } from "./calorie-goal-form";
import { helperStyles } from "./helper-components";
import type { DailyGoals } from "./repository";
export type GoalHelperMode = "calories" | "fluids";
export function GoalHelper({
  defaultUnitSystem = "us",
  defaultFluidUnit = "fl_oz",
  defaultIntent = "lose",
  defaultWeightLb,
  defaultWeightOccurredAt,
  initialMode,
  onClose,
  onUseCalories,
  onUseFluid,
  savedWaterGoalMl,
  savedWeightGoalLb,
  visible,
  onGoalsChange,
}: {
  defaultUnitSystem?: "us" | "metric";
  defaultFluidUnit?: "fl_oz" | "ml";
  defaultIntent?: "maintain" | "lose" | "gain";
  defaultWeightLb?: number;
  defaultWeightOccurredAt?: string;
  initialMode: GoalHelperMode;
  onClose: () => void;
  onUseCalories: (
    calories: number,
    weightGoalLb?: number,
    calculation?: Record<string, unknown>,
  ) => Promise<void>;
  onUseFluid: (
    ml: number,
    calculation?: Record<string, unknown>,
  ) => Promise<void>;
  savedWaterGoalMl?: number;
  savedWeightGoalLb?: number;
  visible: boolean;
  onGoalsChange?: (goals: DailyGoals) => void;
}) {
  const { session } = useAuth();
  const [mode, setMode] = useState(initialMode);
  useEffect(() => {
    if (visible) setMode(initialMode);
  }, [visible, initialMode]);
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <KeyboardInputScope>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 20,
              paddingVertical: 8,
            }}
          >
            <Text accessibilityRole="header" style={helperStyles.section}>
              Goal helper
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close goal helper"
              onPress={close}
              style={{
                width: 44,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Icon name="close" color={colors.secondary} />
            </Pressable>
          </View>
          <View
            accessibilityRole="tablist"
            style={{
              flexDirection: "row",
              gap: 8,
              paddingHorizontal: 20,
              paddingBottom: 12,
            }}
          >
            {(["calories", "fluids"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityLabel={item === "calories" ? "Calories" : "Fluids"}
                accessibilityState={{ selected: mode === item }}
                onPress={() => {
                  Keyboard.dismiss();
                  setMode(item);
                }}
                style={[
                  helperStyles.choice,
                  { flex: 1, alignItems: "center" },
                  mode === item && helperStyles.selected,
                ]}
              >
                <Text style={helperStyles.label}>
                  {item === "calories" ? "Calories" : "Fluids"}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView
            testID="goal-helper-scroll"
            style={{ flex: 1 }}
            key={mode}
            contentContainerStyle={{
              padding: 20,
              paddingBottom: 40,
              maxWidth: 620,
              width: "100%",
              alignSelf: "center",
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
          >
            {visible && session ? (
              mode === "calories" ? (
                <CalorieGoalForm
                  key={session.user.id}
                  userId={session.user.id}
                  defaultUnitSystem={defaultUnitSystem}
                  defaultIntent={defaultIntent}
                  defaultWeightLb={defaultWeightLb}
                  defaultWeightOccurredAt={defaultWeightOccurredAt}
                  savedWeightGoalLb={savedWeightGoalLb}
                  onGoalsChange={onGoalsChange}
                  onUse={async (calories, weight, calculation) => {
                    await onUseCalories(calories, weight, calculation);
                    close();
                  }}
                />
              ) : (
                <FluidGoalForm
                  initialUnit={defaultFluidUnit}
                  savedGoalMl={savedWaterGoalMl}
                  onGoalsChange={onGoalsChange}
                  onUse={async (ml, calculation) => {
                    await onUseFluid(ml, calculation);
                    close();
                  }}
                />
              )
            ) : null}
          </ScrollView>
        </KeyboardInputScope>
      </SafeAreaView>
    </Modal>
  );
}
