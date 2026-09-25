import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../src/features/auth/auth-provider";
import { useAccountSetup } from "../../src/features/onboarding/provider";
import { SetupCard } from "../../src/features/onboarding/setup-card";
import { ScreenScrollView } from "../../src/ui/screen-scroll-view";
import { Pressable } from "../../src/ui/pressable";
import { colors } from "../../src/ui/theme";
import { Icon } from "../../src/ui/icon";
import { Dashboard } from "../../src/features/summary/dashboard";
import { widgetRegistry } from "../../src/features/summary/widget-renderers";
import { type Widget } from "../../src/features/summary/layout";
import { initializeWidgetHabits } from "../../src/features/streaks/initialize";
import { useSummary } from "../../src/features/summary/use-summary";

export default function SummaryScreen() {
  const { session } = useAuth();
  return <SummaryContent key={session?.user.id ?? "signed-out"} />;
}
function SummaryContent() {
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [editing, setEditing] = useState(false);
  const [chartSwipeActive, setChartSwipeActive] = useState(false);
  const data = useSummary(widgets, editing);
  const { now, refreshing } = data;
  const goals = data.goals.data;
  const { setup: accountSetup } = useAccountSetup();
  const rawFirstName = session?.user.user_metadata?.first_name;
  const rawDisplayName = session?.user.user_metadata?.display_name;
  const firstName =
    accountSetup?.preferred_name ||
    (typeof rawFirstName === "string" && rawFirstName.trim()) ||
    (typeof rawDisplayName === "string" &&
      rawDisplayName.trim().split(/\s+/)[0]) ||
    "there";
  return (
    <ScreenScrollView
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={[styles.page, { paddingTop: insets.top + 20 }]}
      alwaysBounceVertical
      directionalLockEnabled
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.blue}
          colors={[colors.blue]}
          progressViewOffset={insets.top + 12}
          title={refreshing ? "Refreshing..." : "Pull to refresh"}
          titleColor={colors.secondary}
          onRefresh={() => {
            void data.refresh(true, true);
            void data.sync();
          }}
        />
      }
      scrollEnabled={!chartSwipeActive && !editing}
    >
      <Text style={styles.date}>
        {new Intl.DateTimeFormat(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        }).format(new Date())}
      </Text>
      <SetupCard
        needed={
          !!goals &&
          (!accountSetup?.preferred_name ||
            goals.calorieGoal === undefined ||
            goals.waterGoalMl === undefined)
        }
      />
      {data.syncIssue ? (
        <Text style={styles.copy}>{data.syncIssue}</Text>
      ) : null}
      {session ? (
        <Dashboard
          header={(begin, ready) => (
            <>
              <View style={styles.summaryHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    accessibilityRole="header"
                    style={[styles.title, width < 360 && { fontSize: 28 }]}
                  >
                    Hi {firstName},
                  </Text>
                  <Text style={styles.snapshot}>Your daily snapshot</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Edit Summary"
                  disabled={!ready}
                  onPress={begin}
                  style={{
                    width: 48,
                    height: 48,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.surface,
                    borderRadius: 24,
                  }}
                >
                  <Icon name="edit" color={colors.blue} size={23} />
                </Pressable>
              </View>
            </>
          )}
          onCommit={async (layout) => {
            await initializeWidgetHabits(session.user.id, layout.widgets);
            void data.refresh(false, true);
          }}
          user={session.user.id}
          onLayoutChange={setWidgets}
          onEditingChange={(value) => {
            setEditing(value);
            setChartSwipeActive(false);
          }}
          render={(widget) =>
            widgetRegistry[widget.type].render(widget, {
              resources: data,
              samples: data.vitals.data ?? [],
              goals: goals ?? {},
              summary: data.nutrition.data ?? { calories: 0, protein: 0 },
              waterMl: data.fluids.data?.countedMl ?? 0,
              pendingFluidMl: data.fluids.data?.pendingMl ?? 0,
              calendarMonth: data.calendarMonth,
              monthCalories: data.calendar.data ?? {},
              moveCalendarMonth: data.moveCalendarMonth,
              setChartSwipeActive,
              now,
              user: session.user.id,
            })
          }
        />
      ) : null}
    </ScreenScrollView>
  );
}
const styles = StyleSheet.create({
  date: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  metricHeading: { flexDirection: "row", alignItems: "center", gap: 5 },
  gestureHint: {
    color: colors.secondary,
    fontSize: 12,
    marginTop: -7,
    marginBottom: 16,
  },
  page: { backgroundColor: colors.background, flexGrow: 1, padding: 20 },
  title: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -1,
    marginTop: 3,
  },
  snapshot: { color: colors.secondary, fontSize: 15, marginTop: 3 },
  summaryHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  copy: { color: colors.secondary, marginBottom: 18, marginTop: -8 },
  metrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  nutritionMetrics: { flexDirection: "row", gap: 12, marginBottom: 12 },
  waterMetric: { flexDirection: "row", marginBottom: 12 },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderCurve: "continuous",
    flex: 1,
    padding: 14,
  },
  metricLabel: {
    color: colors.secondary,
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  metricValue: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    letterSpacing: -0.8,
    marginTop: 12,
  },
  metricDetail: {
    color: colors.secondary,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 12,
  },
  syncArea: { alignItems: "flex-end", maxWidth: 100, marginLeft: 10 },
  sync: {
    alignItems: "center",
    backgroundColor: colors.blueSoft,
    borderColor: colors.blueSoft,
    borderRadius: 22,
    borderCurve: "continuous",
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
  },
  syncPressed: { backgroundColor: colors.blueSoft },
  syncDisabled: { opacity: 0.55 },
  syncText: { color: colors.blue, fontWeight: "700" },
  syncTime: {
    color: colors.tertiary,
    fontSize: 10,
    marginTop: 5,
    textAlign: "right",
  },
});
