import { useEffect, useRef, useState } from "react";
import { PanResponder, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  G,
  Line,
  Polyline,
  Rect,
  Text as SvgText,
} from "react-native-svg";

import {
  bloodPressurePointsForRange,
  connectedBloodPressurePointsForRange,
  connectedPointsForRange,
  pointsForRange,
  shiftTrendReferenceByFraction,
  trendRangeBounds,
  type TimestampPoint,
  type TrendRange,
  type VitalKind,
  type VitalSample,
  unitFor,
} from "../../domain/vitals";
import {
  bloodPressureCategories,
  classifyBloodPressure,
} from "./blood-pressure";
import {
  compactTooltipWidth,
  inclusiveAxisInstants,
  stableValueDomain,
  timelineX,
  timeAxisTicks,
  toggleSelectedPoint,
  type ValueDomain,
} from "./chart";

type Series = {
  label: string;
  points: TimestampPoint[];
  linePoints?: TimestampPoint[];
  lineColor: string;
  marker?: "solid" | "outline";
  pointColor?: (point: TimestampPoint) => string;
};
type ChartWindow = {
  end: Date;
  series: Series[];
  start: Date;
};
type ChartTooltip = {
  at: string;
  color: string;
  label: string;
  value: string;
};
type PositionedPoint = TimestampPoint & { x: number; y: number };

const plot = { left: 33, right: 358, top: 42, bottom: 164 };
function average(points: TimestampPoint[]): number | undefined {
  return points.length
    ? points.reduce((sum, point) => sum + point.value, 0) / points.length
    : undefined;
}

function coordinates(
  points: TimestampPoint[],
  domain: ValueDomain,
  start: Date,
  end: Date,
  clampToWindow = true,
): PositionedPoint[] {
  return points.map((point) => ({
    ...point,
    x: timelineX(
      new Date(point.at).getTime(),
      start.getTime(),
      end.getTime(),
      plot.left,
      plot.right,
      clampToWindow,
    ),
    y:
      plot.bottom -
      ((point.value - domain.min) / (domain.max - domain.min)) *
        (plot.bottom - plot.top),
  }));
}

function LinePlot({
  item,
  domain,
  start,
  end,
  onSelect,
}: {
  item: Series;
  domain: ValueDomain;
  start: Date;
  end: Date;
  onSelect?: (at: string) => void;
}) {
  const points = coordinates(item.points, domain, start, end);
  const linePoints = coordinates(
    item.linePoints ?? item.points,
    domain,
    start,
    end,
    false,
  );
  const path = linePoints.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <>
      {linePoints.length > 1 ? (
        <Polyline
          points={path}
          fill="none"
          stroke={item.lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {points.map((point, index) => {
        const color = item.pointColor?.(point) ?? item.lineColor;
        const outlined = item.marker === "outline";
        return (
          <Circle
            key={`${point.at}-${point.value}-${index}`}
            cx={point.x}
            cy={point.y}
            r="4.5"
            fill={outlined ? "#FFFFFF" : color}
            stroke={color}
            strokeWidth={outlined ? "2.5" : "1"}
          />
        );
      })}
      {onSelect
        ? points.map((point, index) => (
            <Circle
              key={`touch-${point.at}-${point.value}-${index}`}
              cx={point.x}
              cy={point.y}
              r="13"
              fill="#FFFFFF"
              fillOpacity={0.001}
              onPress={(event) => {
                onSelect(point.at);
                return event;
              }}
            />
          ))
        : null}
    </>
  );
}

function formatAxisTick(range: TrendRange, value: Date): string {
  if (range === "D") {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(
      value,
    );
  }
  if (range === "W" || range === "M") {
    return new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
    }).format(value);
  }
  return new Intl.DateTimeFormat(undefined, { month: "short" }).format(value);
}

function formatAxisValue(value: number, span: number): string {
  return value.toFixed(span < 5 ? 1 : 0);
}

function formatReading(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Math.round(value * 100) / 100);
}

function formatAveragePeriod(value: string, range: TrendRange): string {
  const date = new Date(value);
  if (range === "D") {
    const end = new Date(date);
    date.setMinutes(0, 0, 0);
    end.setMinutes(59, 59, 999);
    const formatHour = (point: Date) =>
      new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(point);
    return `${formatHour(date)} – ${formatHour(end)} AVG`;
  }
  if (range === "W" || range === "M") {
    return `${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)} AVG`;
  }
  if (range === "6M") {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startOptions: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      ...(start.getFullYear() === end.getFullYear() ? {} : { year: "numeric" }),
    };
    return `${new Intl.DateTimeFormat(undefined, startOptions).format(start)} – ${new Intl.DateTimeFormat(
      undefined,
      {
        month: "short",
        day: "numeric",
        year: "numeric",
      },
    ).format(end)} AVG`;
  }
  return `${new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date)} AVG`;
}

function formatWindow(start: Date, end: Date): string {
  const [first, , last] = inclusiveAxisInstants(start, end);
  const format = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(value);
  return first.toDateString() === last.toDateString()
    ? format(first)
    : `${format(first)} – ${format(last)}`;
}

function ChartPlot({
  active,
  domain,
  range,
  width,
  window,
  onSelect,
  tooltip,
}: {
  active: boolean;
  domain: ValueDomain;
  range: TrendRange;
  width: number;
  window: ChartWindow;
  onSelect: (at: string) => void;
  tooltip?: ChartTooltip;
}) {
  const ticks = timeAxisTicks(range, window.start, window.end);
  const elapsed = Math.max(window.end.getTime() - window.start.getTime(), 1);
  const tooltipSource = tooltip
    ? window.series
        .flatMap((item) => item.points)
        .find((point) => point.at === tooltip.at)
    : undefined;
  const tooltipPoint = tooltipSource
    ? coordinates([tooltipSource], domain, window.start, window.end)[0]
    : undefined;
  const tooltipWidth = tooltip
    ? compactTooltipWidth(
        [
          { text: tooltip.label, fontSize: 8 },
          { text: tooltip.value, fontSize: 10 },
        ],
        plot.right - plot.left,
      )
    : 0;
  const tooltipHeight = 34;
  const tooltipX = tooltipPoint
    ? Math.max(
        plot.left,
        Math.min(plot.right - tooltipWidth, tooltipPoint.x - tooltipWidth / 2),
      )
    : 0;
  const tooltipY = tooltipPoint
    ? Math.max(3, tooltipPoint.y - tooltipHeight - 7)
    : 0;
  return (
    <View style={{ width }}>
      <Text style={styles.windowLabel}>
        {formatWindow(window.start, window.end)}
      </Text>
      <Svg width="100%" height="215" viewBox="0 0 360 195">
        <ClipPath id="trend-plot-clip">
          <Rect
            x={plot.left}
            y={plot.top}
            width={plot.right - plot.left}
            height={plot.bottom - plot.top}
          />
        </ClipPath>
        {domain.ticks.map((tick, index) => {
          const y = plot.top + (index / 2) * (plot.bottom - plot.top);
          return (
            <G key={tick}>
              <Line
                x1={plot.left}
                y1={y}
                x2={plot.right}
                y2={y}
                stroke="#E6EEF3"
                strokeWidth="1"
              />
              <SvgText
                x={plot.left - 5}
                y={y + 3}
                fill="#7B8794"
                fontSize="9"
                textAnchor="end"
              >
                {formatAxisValue(tick, domain.max - domain.min)}
              </SvgText>
            </G>
          );
        })}
        {ticks.map((tick) => {
          const x =
            plot.left +
            ((tick.getTime() - window.start.getTime()) / elapsed) *
              (plot.right - plot.left);
          return (
            <G key={tick.toISOString()}>
              <Line
                x1={x}
                y1={plot.top}
                x2={x}
                y2={plot.bottom}
                stroke="#EDF2F7"
                strokeWidth="1"
              />
              <SvgText
                fill="#7B8794"
                fontSize="8"
                textAnchor="middle"
                x={x}
                y="185"
              >
                {formatAxisTick(range, tick)}
              </SvgText>
            </G>
          );
        })}
        <G clipPath="url(#trend-plot-clip)">
          {window.series.map((item) => (
            <LinePlot
              key={item.label}
              item={item}
              domain={domain}
              start={window.start}
              end={window.end}
              onSelect={active ? onSelect : undefined}
            />
          ))}
        </G>
        {tooltip && tooltipPoint ? (
          <G>
            <Rect
              fill="#FFFFFF"
              height={tooltipHeight}
              rx="6"
              stroke={tooltip.color}
              strokeWidth="1.25"
              width={tooltipWidth}
              x={tooltipX}
              y={tooltipY}
            />
            <SvgText
              fill="#486581"
              fontSize="8"
              fontWeight="700"
              textAnchor="middle"
              x={tooltipX + tooltipWidth / 2}
              y={tooltipY + 12}
            >
              {tooltip.label}
            </SvgText>
            <SvgText
              fill={tooltip.color}
              fontSize="10"
              fontWeight="800"
              textAnchor="middle"
              x={tooltipX + tooltipWidth / 2}
              y={tooltipY + 26}
            >
              {tooltip.value}
            </SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

function Chart({
  currentWindow,
  range,
  scaleValues,
  showUnitInTooltip = true,
  unit,
  onHorizontalGestureChange,
  onMoveWindow,
}: {
  currentWindow: ChartWindow;
  range: TrendRange;
  scaleValues: number[];
  showUnitInTooltip?: boolean;
  unit: string;
  onHorizontalGestureChange?: (active: boolean) => void;
  onMoveWindow: (direction: -1 | 1, fraction: number) => boolean;
}) {
  const [selectedAt, setSelectedAt] = useState<string>();
  const [viewportWidth, setViewportWidth] = useState(0);
  const widthRef = useRef(340);
  const lastGestureDx = useRef(0);
  const gestureChangeRef = useRef(onHorizontalGestureChange);
  const onMoveWindowRef = useRef(onMoveWindow);
  gestureChangeRef.current = onHorizontalGestureChange;
  onMoveWindowRef.current = onMoveWindow;
  widthRef.current = viewportWidth || 340;
  const startTime = currentWindow.start.getTime();
  const endTime = currentWindow.end.getTime();

  useEffect(() => setSelectedAt(undefined), [endTime, startTime]);

  useEffect(
    () => () => {
      gestureChangeRef.current?.(false);
    },
    [],
  );

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Math.abs(gesture.dx) > 8 &&
        Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.15,
      onPanResponderGrant: () => {
        lastGestureDx.current = 0;
        gestureChangeRef.current?.(true);
      },
      onPanResponderMove: (_, gesture) => {
        const delta = gesture.dx - lastGestureDx.current;
        lastGestureDx.current = gesture.dx;
        if (!delta) return;
        onMoveWindowRef.current(
          delta > 0 ? -1 : 1,
          Math.abs(delta) / widthRef.current,
        );
      },
      onPanResponderRelease: () => {
        lastGestureDx.current = 0;
        gestureChangeRef.current?.(false);
      },
      onPanResponderTerminate: () => {
        lastGestureDx.current = 0;
        gestureChangeRef.current?.(false);
      },
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    }),
  ).current;

  const currentValues = currentWindow.series.flatMap((item) =>
    item.points.map((point) => point.value),
  );
  const domain = stableValueDomain(scaleValues, currentValues);
  const selectedValues = selectedAt
    ? currentWindow.series.flatMap((item) => {
        const point = item.points.find(
          (candidate) => candidate.at === selectedAt,
        );
        return point
          ? [
              {
                value: point.value,
                color: item.pointColor?.(point) ?? item.lineColor,
              },
            ]
          : [];
      })
    : [];
  const selectedReading =
    selectedValues.length === 2
      ? `${formatReading(selectedValues[0].value)}/${formatReading(selectedValues[1].value)}${showUnitInTooltip ? ` ${unit}` : ""}`
      : selectedValues.length === 1
        ? `${formatReading(selectedValues[0].value)}${showUnitInTooltip ? ` ${unit}` : ""}`
        : undefined;
  const tooltip =
    selectedAt && selectedReading
      ? {
          at: selectedAt,
          color: selectedValues[0]?.color ?? "#16776A",
          label: formatAveragePeriod(selectedAt, range),
          value: selectedReading,
        }
      : undefined;
  const width = viewportWidth || 340;

  return (
    <View {...panResponder.panHandlers}>
      <View
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        style={styles.chartViewport}
      >
        <ChartPlot
          active
          domain={domain}
          onSelect={(at) =>
            setSelectedAt((current) => toggleSelectedPoint(current, at))
          }
          range={range}
          tooltip={tooltip}
          width={width}
          window={currentWindow}
        />
      </View>
      {!currentValues.length ? (
        <Text style={styles.empty}>No readings in this period.</Text>
      ) : null}
    </View>
  );
}

function rangeName(range: TrendRange): string {
  return range === "D"
    ? "Daily"
    : range === "W"
      ? "Weekly"
      : range === "M"
        ? "Monthly"
        : range === "6M"
          ? "6-month"
          : "Yearly";
}

function useTrendWindow(range: TrendRange) {
  const [reference, setReference] = useState(() => new Date());
  const referenceRef = useRef(reference);
  const latestReferenceRef = useRef(reference);
  referenceRef.current = reference;
  useEffect(() => {
    const current = new Date();
    referenceRef.current = current;
    latestReferenceRef.current = current;
    setReference(current);
  }, [range]);
  const bounds = trendRangeBounds(range, reference);
  return {
    ...bounds,
    reference,
    moveWindow: (direction: -1 | 1, fraction: number) => {
      const current = referenceRef.current;
      const next = shiftTrendReferenceByFraction(
        range,
        current,
        direction,
        fraction,
        latestReferenceRef.current,
      );
      const currentBounds = trendRangeBounds(range, current);
      const nextBounds = trendRangeBounds(range, next);
      if (
        currentBounds.start.getTime() === nextBounds.start.getTime() &&
        currentBounds.end.getTime() === nextBounds.end.getTime()
      ) {
        return false;
      }
      referenceRef.current = next;
      setReference(next);
      return true;
    },
  };
}

function vitalChartWindow(
  samples: VitalSample[],
  kind: VitalKind,
  title: string,
  range: TrendRange,
  reference: Date,
): ChartWindow {
  const { start, end } = trendRangeBounds(range, reference);
  return {
    start,
    end,
    series: [
      {
        label: title,
        lineColor: "#16776A",
        points: pointsForRange(samples, kind, range, reference),
        linePoints: connectedPointsForRange(samples, kind, range, reference),
      },
    ],
  };
}

function bloodPressureChartWindow(
  samples: VitalSample[],
  range: TrendRange,
  reference: Date,
): ChartWindow {
  const { start, end } = trendRangeBounds(range, reference);
  const pairs = bloodPressurePointsForRange(samples, range, reference);
  const connectedPairs = connectedBloodPressurePointsForRange(
    samples,
    range,
    reference,
  );
  const systolic = pairs.map((point) => ({
    at: point.at,
    value: point.systolic,
  }));
  const diastolic = pairs.map((point) => ({
    at: point.at,
    value: point.diastolic,
  }));
  const pairColors = new Map(
    pairs.map((point) => [
      point.at,
      classifyBloodPressure(point.systolic, point.diastolic).color,
    ]),
  );
  const pointColor = (point: TimestampPoint) =>
    pairColors.get(point.at) ?? "#627D98";
  return {
    start,
    end,
    series: [
      {
        label: "Systolic",
        points: systolic,
        linePoints: connectedPairs.map((point) => ({
          at: point.at,
          value: point.systolic,
        })),
        lineColor: "#9AA9B7",
        marker: "solid",
        pointColor,
      },
      {
        label: "Diastolic",
        points: diastolic,
        linePoints: connectedPairs.map((point) => ({
          at: point.at,
          value: point.diastolic,
        })),
        lineColor: "#C3CDD5",
        marker: "outline",
        pointColor,
      },
    ],
  };
}

export function TrendCard({
  title,
  kind,
  samples,
  range,
  onHorizontalGestureChange,
}: {
  title: string;
  kind: VitalKind;
  samples: VitalSample[];
  range: TrendRange;
  onHorizontalGestureChange?: (active: boolean) => void;
}) {
  const { reference, moveWindow } = useTrendWindow(range);
  const currentWindow = vitalChartWindow(
    samples,
    kind,
    title,
    range,
    reference,
  );
  const points = currentWindow.series[0].points;
  const mean = average(points);
  const scaleValues = samples
    .filter((sample) => sample.kind === kind && !sample.deletedAt)
    .map((sample) => sample.value);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>
          {mean !== undefined
            ? `${mean.toFixed(1)} ${unitFor(kind)}`
            : "No data"}
        </Text>
      </View>
      <Text style={styles.subtitle}>{rangeName(range)} average</Text>
      <Chart
        currentWindow={currentWindow}
        range={range}
        scaleValues={scaleValues}
        unit={unitFor(kind)}
        onHorizontalGestureChange={onHorizontalGestureChange}
        onMoveWindow={moveWindow}
      />
    </View>
  );
}

export function BloodPressureTrendCard({
  samples,
  range,
  onHorizontalGestureChange,
}: {
  samples: VitalSample[];
  range: TrendRange;
  onHorizontalGestureChange?: (active: boolean) => void;
}) {
  const { reference, moveWindow } = useTrendWindow(range);
  const currentWindow = bloodPressureChartWindow(samples, range, reference);
  const systolic = currentWindow.series[0].points;
  const diastolic = currentWindow.series[1].points;
  const sysAverage = average(systolic);
  const diaAverage = average(diastolic);
  const averageCategory =
    sysAverage !== undefined && diaAverage !== undefined
      ? classifyBloodPressure(Math.round(sysAverage), Math.round(diaAverage))
      : undefined;
  const scaleValues = samples
    .filter(
      (sample) =>
        !sample.deletedAt &&
        (sample.kind === "systolic_bp" || sample.kind === "diastolic_bp"),
    )
    .map((sample) => sample.value);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Blood pressure</Text>
        <Text
          style={[
            styles.value,
            averageCategory ? { color: averageCategory.color } : undefined,
          ]}
        >
          {sysAverage !== undefined && diaAverage !== undefined
            ? `${Math.round(sysAverage)}/${Math.round(diaAverage)} mmHg`
            : "No data"}
        </Text>
      </View>
      <Text style={styles.subtitle}>{rangeName(range)} average</Text>
      {averageCategory ? (
        <Text
          style={[styles.averageCategory, { color: averageCategory.color }]}
        >
          {averageCategory.label}
        </Text>
      ) : null}
      <View style={styles.categoryLegend}>
        {bloodPressureCategories.map((category) => (
          <View key={category.id} style={styles.categoryKey}>
            <View
              style={[styles.categoryDot, { backgroundColor: category.color }]}
            />
            <Text style={[styles.categoryText, { color: category.color }]}>
              {category.label.replace(" Hypertension", "")}
            </Text>
          </View>
        ))}
      </View>
      <Chart
        currentWindow={currentWindow}
        range={range}
        scaleValues={scaleValues}
        showUnitInTooltip={false}
        unit="mmHg"
        onHorizontalGestureChange={onHorizontalGestureChange}
        onMoveWindow={moveWindow}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF3",
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 14,
    padding: 14,
  },
  header: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  value: { color: "#16776A", fontSize: 19, fontWeight: "800" },
  subtitle: { color: "#7B8794", fontSize: 13, marginTop: 4 },
  averageCategory: { fontSize: 12, fontWeight: "800", marginTop: 3 },
  categoryLegend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  categoryKey: { alignItems: "center", flexDirection: "row", gap: 3 },
  categoryDot: { borderRadius: 4, height: 7, width: 7 },
  categoryText: { fontSize: 10, fontWeight: "700" },
  chartViewport: { marginHorizontal: -10 },
  windowLabel: {
    color: "#486581",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 10,
    textAlign: "center",
  },
  empty: {
    color: "#7B8794",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
});
