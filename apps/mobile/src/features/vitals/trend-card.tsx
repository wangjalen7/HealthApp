import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  G,
  Line,
  Polyline,
  Text as SvgText,
} from "react-native-svg";

import {
  latestSample,
  pointsForRange,
  trendRangeBounds,
  type TimestampPoint,
  type TrendRange,
  type VitalKind,
  type VitalSample,
  unitFor,
} from "../../domain/vitals";
import {
  inclusiveAxisInstants,
  paddedValueDomain,
  toggleSelectedPoint,
} from "./chart";

type Series = {
  label: string;
  points: TimestampPoint[];
  color: string;
};
type PositionedPoint = TimestampPoint & { x: number; y: number };

const plot = { left: 43, right: 330, top: 9, bottom: 95 };

function average(points: TimestampPoint[]): number | undefined {
  return points.length
    ? points.reduce((sum, point) => sum + point.value, 0) / points.length
    : undefined;
}

function coordinates(
  points: TimestampPoint[],
  values: number[],
  start: Date,
  end: Date,
): PositionedPoint[] {
  const domain = paddedValueDomain(values);
  const elapsed = Math.max(end.getTime() - start.getTime(), 1);
  return points.map((point) => ({
    ...point,
    x:
      plot.left +
      Math.max(
        0,
        Math.min(
          1,
          (new Date(point.at).getTime() - start.getTime()) / elapsed,
        ),
      ) *
        (plot.right - plot.left),
    y:
      plot.bottom -
      ((point.value - domain.min) / (domain.max - domain.min)) *
        (plot.bottom - plot.top),
  }));
}

function LinePlot({
  series,
  color,
  allValues,
  start,
  end,
  onSelect,
}: {
  series: TimestampPoint[];
  color: string;
  allValues: number[];
  start: Date;
  end: Date;
  onSelect: (at: string) => void;
}) {
  const points = coordinates(series, allValues, start, end);
  const path = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <>
      {points.length > 1 ? (
        <Polyline
          points={path}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {points.map((point, index) => (
        <Circle
          key={`${point.at}-${point.value}-${index}`}
          cx={point.x}
          cy={point.y}
          r="4"
          fill={color}
        />
      ))}
      {points.map((point, index) => (
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
      ))}
    </>
  );
}

function axisLabels(
  range: TrendRange,
  start: Date,
  end: Date,
): [string, string, string] {
  if (range === "D") return ["12 AM", "12 PM", "11:59 PM"];
  const formatDate = (value: Date) =>
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(value);
  return inclusiveAxisInstants(start, end).map(formatDate) as [
    string,
    string,
    string,
  ];
}

function formatAxisValue(value: number, span: number): string {
  return value.toFixed(span < 5 ? 1 : 0);
}

function formatReading(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function formatPointTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function Chart({
  series,
  range,
  unit,
}: {
  series: Series[];
  range: TrendRange;
  unit: string;
}) {
  const [selectedAt, setSelectedAt] = useState<string>();
  const values = series.flatMap((item) => item.points.map((point) => point.value));
  const { start, end } = trendRangeBounds(range);
  if (!values.length) {
    return <Text style={styles.empty}>Add a reading to begin this trend.</Text>;
  }
  const domain = paddedValueDomain(values);
  const labels = axisLabels(range, start, end);
  const selectedValues = selectedAt
    ? series.flatMap((item) => {
        const point = item.points.find((candidate) => candidate.at === selectedAt);
        return point ? [{ label: item.label, value: point.value }] : [];
      })
    : [];
  const selectedReading =
    selectedValues.length === 2
      ? `${formatReading(selectedValues[0].value)}/${formatReading(selectedValues[1].value)} ${unit}`
      : selectedValues.length === 1
        ? `${formatReading(selectedValues[0].value)} ${unit}`
        : undefined;
  return (
    <View>
      <Svg width="100%" height="122" viewBox="0 0 340 108">
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
                x={plot.left - 7}
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
        {series.map((item) => (
          <LinePlot
            key={item.label}
            series={item.points}
            color={item.color}
            allValues={values}
            start={start}
            end={end}
            onSelect={(at) =>
              setSelectedAt((current) => toggleSelectedPoint(current, at))
            }
          />
        ))}
      </Svg>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{labels[0]}</Text>
        <Text style={styles.axisText}>{labels[1]}</Text>
        <Text style={styles.axisText}>{labels[2]}</Text>
      </View>
      {selectedReading && selectedAt ? (
        <View style={styles.inspector}>
          <Text style={styles.inspectorValue}>{selectedReading}</Text>
          <Text style={styles.inspectorTime}>{formatPointTime(selectedAt)}</Text>
        </View>
      ) : (
        <Text style={styles.tapHint}>Tap a point to inspect its reading.</Text>
      )}
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

export function TrendCard({
  title,
  kind,
  samples,
  range,
}: {
  title: string;
  kind: VitalKind;
  samples: VitalSample[];
  range: TrendRange;
}) {
  const points = pointsForRange(samples, kind, range);
  const latest = latestSample(samples, kind);
  const mean = average(points);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.value}>
          {latest ? `${latest.value} ${unitFor(kind)}` : "No data"}
        </Text>
      </View>
      <Text style={styles.subtitle}>
        {rangeName(range)} average: {mean !== undefined ? `${mean.toFixed(1)} ${unitFor(kind)}` : "--"}
      </Text>
      <Chart
        series={[{ label: title, points, color: "#16776A" }]}
        range={range}
        unit={unitFor(kind)}
      />
    </View>
  );
}

export function BloodPressureTrendCard({
  samples,
  range,
}: {
  samples: VitalSample[];
  range: TrendRange;
}) {
  const systolic = pointsForRange(samples, "systolic_bp", range);
  const diastolic = pointsForRange(samples, "diastolic_bp", range);
  const sysAverage = average(systolic);
  const diaAverage = average(diastolic);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Blood pressure</Text>
        <Text style={styles.value}>
          {sysAverage !== undefined && diaAverage !== undefined
            ? `${Math.round(sysAverage)}/${Math.round(diaAverage)}`
            : "No data"}
        </Text>
      </View>
      <Text style={styles.subtitle}>{rangeName(range)} average · mmHg</Text>
      <View style={styles.legend}>
        <View style={[styles.legendDot, { backgroundColor: "#16776A" }]} />
        <Text style={styles.legendText}>Systolic</Text>
        <View style={[styles.legendDot, { backgroundColor: "#3B82C4" }]} />
        <Text style={styles.legendText}>Diastolic</Text>
      </View>
      <Chart
        series={[
          { label: "Systolic", points: systolic, color: "#16776A" },
          { label: "Diastolic", points: diastolic, color: "#3B82C4" },
        ]}
        range={range}
        unit="mmHg"
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
    padding: 16,
  },
  header: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  title: { color: "#243B53", fontSize: 16, fontWeight: "800" },
  value: { color: "#16776A", fontSize: 19, fontWeight: "800" },
  subtitle: { color: "#7B8794", fontSize: 13, marginTop: 4 },
  legend: { alignItems: "center", flexDirection: "row", gap: 5, marginTop: 12 },
  legendDot: { borderRadius: 5, height: 9, marginLeft: 6, width: 9 },
  legendText: { color: "#627D98", fontSize: 12 },
  empty: { color: "#7B8794", fontSize: 14, marginTop: 22 },
  axis: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -9,
    paddingLeft: 43,
    paddingRight: 10,
  },
  axisText: { color: "#7B8794", fontSize: 10 },
  tapHint: { color: "#7B8794", fontSize: 11, marginTop: 10, textAlign: "center" },
  inspector: {
    alignItems: "center",
    backgroundColor: "#F1F7F6",
    borderRadius: 10,
    marginTop: 10,
    padding: 9,
  },
  inspectorValue: { color: "#102A43", fontSize: 15, fontWeight: "800" },
  inspectorTime: { color: "#627D98", fontSize: 11, marginTop: 2 },
});
