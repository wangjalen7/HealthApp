import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../ui/theme";
import { stepChartBounds, type StepRange, type StepBucket } from "./model";
export function stepBucketLabel(row: StepBucket, range: StepRange) {
  const date = new Date(row.start);
  if (range === "6M") {
    const last = new Date(row.end);
    last.setDate(last.getDate() - 1);
    const options = { month: "short", day: "numeric" } as const;
    return `${date.toLocaleDateString(undefined, options)} – ${last.toLocaleDateString(undefined, options)}`;
  }
  return date.toLocaleString(
    undefined,
    range === "D"
      ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" }
      : range === "Y"
        ? { month: "long", year: "numeric" }
        : { weekday: "short", month: "short", day: "numeric" },
  );
}
export function StepChart({
  rows,
  start,
  end,
  range,
  now,
  selected,
  onSelect,
}: {
  rows: StepBucket[];
  start: Date;
  end: Date;
  range: StepRange;
  now: Date;
  selected?: string;
  onSelect: (value: string) => void;
}) {
  const [width, setWidth] = useState(300);
  const pressX = useRef<number | undefined>(undefined);
  const slots = stepChartBounds(start, end, range);
  const byStart = new Map(rows.map((b) => [b.start, b]));
  const peak = Math.max(1, ...rows.map((b) => b.total ?? 0));
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const max =
    ([1, 2, 5, 10].find((multiple) => multiple * magnitude >= peak) ?? 10) *
    magnitude;
  const index = rows.findIndex((b) => b.start === selected);
  const choose = (direction: number) => {
    const row =
      rows[
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            index < 0
              ? direction > 0
                ? 0
                : rows.length - 1
              : index + direction,
          ),
        )
      ];
    if (row) onSelect(row.start);
  };
  const chosen = rows[index];
  const selectedSlot = slots.findIndex(
    (slot) => slot.start.toISOString() === selected,
  );
  const popupWidth = Math.min(200, width);
  const popupLeft = Math.max(
    0,
    Math.min(
      width - popupWidth,
      ((selectedSlot + 0.5) / slots.length) * width - popupWidth / 2,
    ),
  );
  const description = chosen
    ? chosen.total === null
      ? "No step data"
      : `${Math.round(chosen.total).toLocaleString()} steps${range === "6M" || range === "Y" ? " / day" : ""}`
    : "";
  const summary = rows.length
    ? rows
        .map(
          (b) =>
            `${stepBucketLabel(b, range)}: ${b.total === null ? "no data" : `${b.total} steps`}${new Date(b.end) > now ? ", in progress" : ""}`,
        )
        .join(". ")
    : "No step data available";
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="adjustable"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, rows.length - 1)}
        aria-valuenow={Math.max(0, index)}
        aria-valuetext={
          chosen
            ? `${stepBucketLabel(chosen, range)}, ${chosen.total ?? "no data"}`
            : "No period selected"
        }
        accessibilityLabel={`Steps bar chart. ${summary}`}
        accessibilityHint="Swipe up or down to select a period and hear its step count."
        accessibilityValue={{
          text: chosen
            ? `${stepBucketLabel(chosen, range)}, ${chosen.total ?? "no data"}`
            : "No period selected",
        }}
        accessibilityActions={[
          { name: "increment", label: "Next period" },
          { name: "decrement", label: "Previous period" },
        ]}
        onAccessibilityAction={(e) =>
          choose(e.nativeEvent.actionName === "increment" ? 1 : -1)
        }
        {...(Platform.OS === "web"
          ? {
              onKeyDown: (event: {
                key: string;
                preventDefault: () => void;
              }) => {
                if (
                  ["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  choose(
                    event.key === "ArrowRight" || event.key === "ArrowUp"
                      ? 1
                      : -1,
                  );
                }
              },
            }
          : {})}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPressIn={(e) => {
          pressX.current = e.nativeEvent.locationX;
        }}
        onPress={(e) => {
          // RN Web click events expose offsetX; native touch events use locationX.
          // Bars ignore pointer events so both coordinates refer to the chart.
          const x =
            pressX.current ??
            e.nativeEvent.locationX ??
            (e.nativeEvent as unknown as { offsetX?: number }).offsetX;
          pressX.current = undefined;
          if (x === undefined || !Number.isFinite(x)) return;
          const slot =
            slots[
              Math.min(
                slots.length - 1,
                Math.max(0, Math.floor((x / width) * slots.length)),
              )
            ];
          if (slot && slot.start <= now) onSelect(slot.start.toISOString());
        }}
        testID="steps-chart"
        style={styles.chart}
      >
        {[0, 0.5, 1].map((fraction) => (
          <View
            key={fraction}
            pointerEvents="none"
            style={[styles.gridLine, { top: fraction * 219 }]}
          >
            <Text style={styles.yAxis}>
              {Math.round(max * (1 - fraction)).toLocaleString()}
            </Text>
          </View>
        ))}
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          aria-hidden
          style={styles.bars}
        >
          {slots.map((slot) => {
            const b = byStart.get(slot.start.toISOString()),
              future = slot.start > now;
            return (
              <View key={slot.start.toISOString()} style={styles.column}>
                {b?.total !== null && b?.total !== undefined ? (
                  <View
                    style={{
                      width: "72%",
                      minHeight: b.total === 0 ? 2 : 3,
                      height: Math.max(0, (b.total / max) * 219),
                      borderRadius: 3,
                      backgroundColor: colors.orange,
                      opacity:
                        selected && selected !== b.start
                          ? 0.35
                          : slot.end > now
                            ? 0.6
                            : 1,
                    }}
                  />
                ) : !future ? (
                  <View
                    style={{
                      width: 4,
                      height: 2,
                      backgroundColor: colors.tertiary,
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
        {chosen ? (
          <>
            <View
              pointerEvents="none"
              style={[
                styles.selectionLine,
                { left: ((selectedSlot + 0.5) / slots.length) * width },
              ]}
            />
            <View
              pointerEvents="none"
              testID="steps-chart-popover"
              accessibilityLiveRegion="polite"
              style={[styles.popover, { width: popupWidth, left: popupLeft }]}
            >
              <Text style={styles.popupDate}>
                {stepBucketLabel(chosen, range)}
              </Text>
              <Text style={styles.popupValue}>{description}</Text>
            </View>
          </>
        ) : null}
      </Pressable>
      <View
        accessible={false}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginRight: 36,
        }}
      >
        {(range === "W"
          ? [0, 1, 2, 3, 4, 5, 6]
          : range === "D"
            ? [0, 6, 12, 18]
            : [0, Math.floor(slots.length / 2), slots.length - 1]
        ).map((i) => (
          <Text key={i} style={styles.axis}>
            {slots[i]!.start.toLocaleString(
              undefined,
              range === "D"
                ? { hour: "numeric" }
                : range === "W"
                  ? { weekday: "narrow" }
                  : range === "6M" || range === "Y"
                    ? { month: "short" }
                    : { month: "short", day: "numeric" },
            )}
          </Text>
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  chart: {
    height: 220,
    marginRight: 36,
    borderBottomWidth: 1,
    borderBottomColor: colors.separator,
  },
  bars: { flex: 1, flexDirection: "row", alignItems: "flex-end" },
  column: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  axis: { color: colors.secondary, fontSize: 11 },
  gridLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.separator,
  },
  yAxis: {
    position: "absolute",
    left: "100%",
    marginLeft: 5,
    top: -6,
    color: colors.secondary,
    fontSize: 10,
  },
  selectionLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.secondary,
  },
  popover: {
    position: "absolute",
    top: 0,
    backgroundColor: colors.fill,
    borderRadius: 10,
    padding: 8,
    gap: 2,
  },
  popupDate: { color: colors.secondary, fontSize: 12 },
  popupValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
