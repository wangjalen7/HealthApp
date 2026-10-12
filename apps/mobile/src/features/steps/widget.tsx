import { Text, View } from "react-native";
import { router } from "expo-router";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { WidgetHeading, widgetStyles } from "../summary/widget-design";
import { WidgetSkeleton } from "../summary/widget-skeleton";
import { dayKey } from "../summary/calendar";
import { goalProgress } from "./model";
import type { useSteps } from "./use-steps";
import type { Widget } from "../summary/layout";
export function StepsWidget({
  steps,
  goal,
  widget,
}: {
  steps: ReturnType<typeof useSteps>;
  goal?: number;
  widget: Widget;
}) {
  if (!steps.data && steps.loading) return <WidgetSkeleton widget={widget} />;
  const today = steps.data?.daily.find(
    (b) => dayKey(new Date(b.start)) === dayKey(steps.now),
  );
  const total = today?.total ?? undefined;
  const progress = total === undefined ? undefined : goalProgress(total, goal);
  return (
    <Pressable
      style={widgetStyles.card}
      accessibilityRole="button"
      accessibilityHint="Opens Steps detail."
      onPress={() =>
        router.push({ pathname: "/(app)/steps", params: { from: "summary" } })
      }
    >
      <WidgetHeading type="steps" title="Steps" />
      <Text
        style={{
          color: colors.text,
          fontSize: widget.size === "wide" ? 34 : 28,
          fontWeight: "700",
          fontVariant: ["tabular-nums"],
        }}
      >
        {total?.toLocaleString() ?? "—"}
      </Text>
      <Text style={{ color: colors.secondary, fontSize: 13 }}>
        {total !== undefined
          ? "Today"
          : steps.unavailable
            ? "Available on iPhone"
            : !steps.data?.connected
              ? "Connect Apple Health"
              : "No step data available"}
      </Text>
      {goal !== undefined ? (
        <>
          <Text style={{ color: colors.secondary, fontSize: 13 }}>
            Goal {goal.toLocaleString()}
          </Text>
          {progress !== undefined ? (
            <View
              accessibilityRole="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress * 100)}
              accessibilityValue={{
                min: 0,
                max: 100,
                now: Math.round(progress * 100),
              }}
              style={{
                height: 5,
                borderRadius: 3,
                backgroundColor: colors.fill,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${progress * 100}%`,
                  height: 5,
                  backgroundColor: colors.green,
                }}
              />
            </View>
          ) : null}
        </>
      ) : null}
      {steps.error ? (
        <Text style={{ color: colors.secondary, fontSize: 12 }}>
          Saved data · Could not refresh
        </Text>
      ) : null}
    </Pressable>
  );
}
