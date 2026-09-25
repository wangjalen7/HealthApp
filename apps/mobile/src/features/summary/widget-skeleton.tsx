import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { Skeleton, SkeletonGroup } from "../../ui/skeleton";
import { colors } from "../../ui/theme";
import { WidgetHeading, widgetStyles } from "./widget-design";
import { habitLabels, registry, type Widget } from "./layout";

export function WidgetSkeleton({
  widget,
  controls,
  error,
  retry,
}: {
  widget: Widget;
  controls?: ReactNode;
  error?: string;
  retry?: ReactNode;
}) {
  return (
    <View style={widgetStyles.card}>
      <WidgetHeading type={widget.type} title={registry[widget.type].title} />
      {controls}
      {error ? (
        <>
          <Text
            accessibilityRole="alert"
            style={{ color: colors.secondary, fontSize: 14, lineHeight: 20 }}
          >
            Could not load this information.
          </Text>
          {retry}
        </>
      ) : (
        <SkeletonGroup
          label={`Loading ${registry[widget.type].title}`}
          testID={`skeleton-${widget.type}`}
        >
          <PlaceholderContent widget={widget} />
        </SkeletonGroup>
      )}
    </View>
  );
}
function PlaceholderContent({ widget }: { widget: Widget }) {
  if (widget.type.endsWith("_trend"))
    return (
      <>
        <Skeleton width="45%" height={28} />
        <Skeleton height={210} round={14} />
        <Skeleton width="65%" height={12} />
      </>
    );
  if (widget.type === "meals")
    return (
      <>
        {[0, 1].map((i) => (
          <View key={i} style={{ gap: 10, paddingVertical: 8 }}>
            <Skeleton width="55%" height={20} />
            <Skeleton width="90%" />
            <Skeleton width="40%" height={12} />
          </View>
        ))}
      </>
    );
  if (widget.type === "training")
    return (
      <>
        <Text style={{ color: colors.secondary, fontSize: 14 }}>
          {widget.config.period === "last7" ? "Last 7 days" : "This week"}
        </Text>
        <Skeleton width="70%" />
        <Skeleton width="65%" height={36} />
        <Skeleton width="80%" />
        {widget.size === "wide" ? (
          <>
            <Skeleton width="90%" />
            <Skeleton width="65%" />
            <Skeleton width="85%" />
          </>
        ) : null}
        <Skeleton width="50%" height={32} />
      </>
    );
  if (widget.type === "streaks")
    return (
      <>
        {(widget.config.habits ?? []).map((habit) => (
          <View key={habit} style={{ gap: 10, paddingVertical: 8 }}>
            <Text
              style={{ color: colors.text, fontSize: 17, fontWeight: "600" }}
            >
              {habitLabels[habit]}
            </Text>
            <Skeleton width="70%" height={36} />
            {habit === "training" ? <Skeleton width="85%" /> : null}
            <Skeleton width="65%" />
            <Text style={{ color: colors.secondary, fontSize: 14 }}>
              This week
            </Text>
            <View style={{ flexDirection: "row" }}>
              {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center", gap: 5 }}>
                  <Text style={{ color: colors.secondary, fontSize: 12 }}>
                    {day}
                  </Text>
                  <Skeleton width={18} height={18} round={9} />
                  <Skeleton width={12} height={11} />
                </View>
              ))}
            </View>
          </View>
        ))}
      </>
    );
  const metric = widget.type === "weight" || widget.type === "bp";
  return (
    <>
      <Skeleton width="60%" height={widget.size === "wide" ? 40 : 36} />
      {metric ? null : <Skeleton height={6} />}
      <Skeleton width="80%" height={16} />
      {metric ? <Skeleton width="55%" height={12} /> : null}
    </>
  );
}
