import { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Modal } from "../../ui/modal";
import { Pressable } from "../../ui/pressable";
import { TextInput } from "../../ui/text-input";
import { colors, surfaces } from "../../ui/theme";
import { muscleGroupLabel } from "../training/workout-draft";
import { dayKey, deviceZone } from "./calendar";
import { habitLabels, actionRoutes, type Habit, type Widget } from "./layout";
import { type SummaryData } from "./data";
import { personalRecords, trainingSummary } from "./training";
import { evaluateStreak } from "../streaks/engine";
import {
  explanations,
  ruleConfigSchema,
  type RuleConfig,
} from "../streaks/model";
import { effectiveRuleDay, saveRule } from "../streaks/repository";
import { weekdayLabels, reminderTitle } from "../reminders/model";
import { Action } from "./dashboard";
export function ExtraWidget({
  widget,
  data,
  now,
  user,
  reload,
  loading,
}: {
  widget: Widget;
  data?: SummaryData;
  now: Date;
  user: string;
  reload: () => void;
  loading: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Habit>();
  const verified = useRef(new Map<Habit, { current: number; best: number }>());
  if (!data)
    return (
      <View style={styles.card}>
        <ActivityIndicator color={colors.blue} />
        <Text style={styles.copy}>Loading summary…</Text>
      </View>
    );
  const stale = loading ? (
    <Text style={styles.copy}>Refreshing saved results…</Text>
  ) : null;
  if (widget.type === "actions")
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          {widget.config.actions?.map((action) => (
            <Action
              key={action}
              label={
                action === "Workout" && data.workoutDraft
                  ? "Resume workout"
                  : action === "Food" && data.mealDraft
                    ? "Resume meal"
                    : action
              }
              onPress={() => router.push(actionRoutes[action])}
            />
          ))}
        </View>
      </View>
    );
  if (widget.type === "training") {
    const value = trainingSummary(
      data.sources.sessions,
      data.sources.sets,
      data.sources.cardio,
      now,
      widget.config.period ?? "week",
    );
    const rule = data.rules
      .filter(
        (r) =>
          r.habit === "training" && r.enabled && r.effective_day <= dayKey(now),
      )
      .at(-1);
    return (
      <View style={styles.card}>
        {stale}
        <Text style={styles.copy}>
          {widget.config.period === "last7"
            ? "Last 7 days"
            : "This week · Monday–Sunday"}
          {"\n"}
          {value.start} – {value.end}
        </Text>
        {data.trainingComplete ? (
          <>
            <Text style={styles.value}>
              {value.lifting + value.cardio} sessions
            </Text>
            <Text style={styles.copy}>
              {value.days} training days
              {rule && widget.config.period !== "last7"
                ? ` · ${value.days} of ${rule.config.trainingDays} training days`
                : ""}
            </Text>
            {widget.size === "wide" ? (
              <>
                <Text style={styles.copy}>
                  {value.lifting} lifting · {value.cardio} cardio · {value.sets}{" "}
                  logical sets
                </Text>
                <Text style={styles.copy}>
                  {Math.round(value.minutes * 10) / 10} Cardio minutes
                </Text>
                <Text style={styles.copy}>
                  {Object.entries(value.groups)
                    .map(
                      ([group, count]) => `${muscleGroupLabel(group)} ${count}`,
                    )
                    .join(" · ") || "No completed training in this period."}
                </Text>
              </>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>
            Training history is unavailable. Counts are unknown.
          </Text>
        )}
        <Action
          label={value.days ? "View training details" : "Start workout"}
          onPress={() =>
            value.days
              ? router.push({
                  pathname: "/(app)/history",
                  params: { view: "exercise" },
                })
              : router.push("/(app)/workout")
          }
        />
        {!data.trainingComplete ? (
          <Action label="Retry training summary" onPress={reload} />
        ) : null}
      </View>
    );
  }
  if (widget.type === "pr") {
    const record = data.trainingComplete
      ? personalRecords(
          data.sources.sessions.filter(
            (s) => Date.parse(s.completed_at) <= now.getTime(),
          ),
          data.sources.sets,
        )[0]
      : undefined;
    return (
      <View style={styles.card}>
        {stale}
        {!data.trainingComplete ? (
          <>
            <Text style={styles.copy}>
              Complete workout history is unavailable. Records are unknown.
            </Text>
            <Action label="Retry personal records" onPress={reload} />
          </>
        ) : !record ? (
          <Text style={styles.copy}>
            Log comparable workouts to see your next personal record.
          </Text>
        ) : (
          <>
            <Text style={styles.title}>
              {record.name}
              {record.side !== "bilateral" ? ` · ${record.side}` : ""}
            </Text>
            <Text style={styles.value}>
              {record.value} {record.type === "load" ? record.unit : "reps"}
            </Text>
            <Text style={styles.copy}>
              {record.type === "load"
                ? "Highest logged load"
                : "Most reps at the same load"}{" "}
              · Previous {record.previous}{" "}
              {record.type === "load" ? record.unit : "reps"}
            </Text>
            <Text style={styles.copy}>
              {dayKey(new Date(record.at))}
              {widget.size === "wide"
                ? ` · Set ${record.setNumber}: ${record.reps} reps at ${record.load} ${record.unit}`
                : ""}
            </Text>
            <Action
              label="Open record workout"
              onPress={() =>
                router.push({
                  pathname: "/(app)/history/[id]",
                  params: { id: record.sessionId },
                })
              }
            />
          </>
        )}
        <Text style={styles.copy}>
          Based on logged exercise names and loads; equipment identity is not
          fully recorded.
        </Text>
      </View>
    );
  }
  if (widget.type !== "streaks") return null;
  return (
    <View style={styles.card}>
      {stale}
      {widget.config.habits?.map((habit) => {
        const result = evaluateStreak(
            habit,
            data.rules,
            data.sources,
            now,
            deviceZone(),
          ),
          period = result.periods.at(-1);
        if (!result.unknown && result.activation)
          verified.current.set(habit, {
            current: result.current,
            best: result.best,
          });
        const previous = verified.current.get(habit);
        return (
          <Pressable
            key={habit}
            accessibilityRole="button"
            accessibilityLabel={`${habitLabels[habit]} streak details`}
            onPress={() => setSelected(habit)}
            style={{ minHeight: 60, gap: 6, paddingVertical: 8 }}
          >
            <Text style={styles.title}>{habitLabels[habit]}</Text>
            {!result.activation ? (
              <Text style={styles.copy}>Set up this optional habit</Text>
            ) : (
              <>
                <Text style={styles.value}>
                  {result.unknown ? "Unverified" : result.current}{" "}
                  {habit === "training" ? "weeks" : "days"}
                </Text>
                {result.unknown && previous ? (
                  <Text style={styles.copy}>
                    Last verified: {previous.current}{" "}
                    {habit === "training" ? "weeks" : "days"} · stale until
                    history is available
                  </Text>
                ) : null}
                <Text style={styles.copy}>
                  {period
                    ? `${stateLabel(period.state)} · ${Math.round(period.count * 10) / 10} / ${Math.round(period.target * 10) / 10}`
                    : "Tracking begins on the effective date."}
                </Text>
                <Text style={styles.copy}>
                  Best confirmed:{" "}
                  {result.unknown && previous ? previous.best : result.best} ·
                  since {result.activation}
                  {result.unknown ? " · incomplete coverage" : ""}
                </Text>
                <View style={styles.row}>
                  {result.periods.slice(-7).map((p) => (
                    <Text
                      key={p.day}
                      accessibilityLabel={`${p.day}: ${stateLabel(p.state)}`}
                      style={{
                        color:
                          p.state === "met" ? colors.blue : colors.secondary,
                        fontSize: 15,
                      }}
                    >
                      {p.day.slice(5)}{" "}
                      {p.state === "met"
                        ? "✓"
                        : p.state === "unknown"
                          ? "?"
                          : p.state === "not_scheduled"
                            ? "–"
                            : "○"}
                    </Text>
                  ))}
                </View>
                {habit === "reminder" ? (
                  <Text style={styles.copy}>On this device</Text>
                ) : null}
              </>
            )}
          </Pressable>
        );
      })}
      {data.errors.length ? (
        <>
          <Text style={styles.copy}>{data.errors.join("\n")}</Text>
          <Action label="Retry streak data" onPress={reload} />
        </>
      ) : null}
      {selected ? (
        <StreakDetail
          key={selected}
          habit={selected}
          data={data}
          now={now}
          user={user}
          close={() => setSelected(undefined)}
          reload={reload}
        />
      ) : null}
    </View>
  );
}
function stateLabel(state: string) {
  return (
    (
      {
        met: "Met",
        open: "In progress",
        not_met: "No qualifying log",
        unconfirmed: "Not confirmed",
        unknown: "Unknown",
        not_scheduled: "Not scheduled",
      } as Record<string, string>
    )[state] ?? state
  );
}
function StreakDetail({
  habit,
  data,
  now,
  user,
  close,
  reload,
}: {
  habit: Habit;
  data: SummaryData;
  now: Date;
  user: string;
  close: () => void;
  reload: () => void;
}) {
  const router = useRouter(),
    insets = useSafeAreaInsets();
  const existing = data.rules
    .filter((r) => r.habit === habit)
    .sort((a, b) => a.effective_day.localeCompare(b.effective_day))
    .at(-1);
  const [config, setConfig] = useState<RuleConfig>(
    existing?.config ?? ruleConfigSchema.parse({}),
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const result = evaluateStreak(
    habit,
    data.rules,
    data.sources,
    now,
    deviceZone(),
  );
  const goals = data.sources.goals
      .filter((g) => g.effective_day <= dayKey(now))
      .at(-1),
    target = Number(goals?.calorie_goal);
  const action =
    habit === "training"
      ? "Workout"
      : habit === "weight"
        ? "Weight"
        : habit === "bp"
          ? "Blood pressure"
          : habit === "reminder"
            ? "Reminders"
            : habit.startsWith("fluid")
              ? "Fluids"
              : "Food";
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 30,
          gap: 14,
          backgroundColor: colors.background,
        }}
      >
        <View style={styles.row}>
          <Text accessibilityRole="header" style={styles.title}>
            {habitLabels[habit]}
          </Text>
          <Action label="Close streak details" onPress={close} />
        </View>
        <Text style={styles.copy}>{explanations[habit]}</Text>
        <Action
          label={`Open ${action} log`}
          onPress={() => {
            close();
            router.push(actionRoutes[action]);
          }}
        />
        <Text style={styles.copy}>
          Best confirmed: {result.best}{" "}
          {habit === "training" ? "weeks" : "days"}
          {result.activation
            ? ` since ${result.activation}`
            : ". Tracking not enabled yet."}
          {result.unknown
            ? ". Some periods are unknown; no verified run is claimed across them."
            : ""}
        </Text>
        <View style={styles.row}>
          <Text style={styles.title}>Enable this streak</Text>
          <Switch
            accessibilityLabel="Enable this streak"
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ true: colors.blue, false: colors.separator }}
          />
        </View>
        {habit === "training" ? (
          <View style={styles.row}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Action
                key={n}
                selected={config.trainingDays === n}
                label={`${config.trainingDays === n ? "✓ " : ""}${n} training days`}
                onPress={() => setConfig({ ...config, trainingDays: n })}
              />
            ))}
          </View>
        ) : null}
        {habit === "weight" || habit === "bp" ? (
          <>
            <Text style={styles.copy}>Scheduled weekdays</Text>
            <View style={styles.row}>
              {weekdayLabels.map((day, i) => (
                <Action
                  key={day}
                  selected={config.weekdays.includes(i)}
                  label={`${config.weekdays.includes(i) ? "✓ " : ""}${day}`}
                  onPress={() =>
                    setConfig({
                      ...config,
                      weekdays: config.weekdays.includes(i)
                        ? config.weekdays.filter((d) => d !== i)
                        : [...config.weekdays, i],
                    })
                  }
                />
              ))}
            </View>
            <View style={styles.row}>
              <Text style={styles.copy}>Include imported readings</Text>
              <Switch
                accessibilityLabel="Include imported readings"
                value={config.includeImports}
                onValueChange={(includeImports) =>
                  setConfig({ ...config, includeImports })
                }
                trackColor={{ true: colors.blue, false: colors.separator }}
              />
            </View>
          </>
        ) : null}
        {habit === "calorie_target" ? (
          <>
            <Text style={styles.copy}>
              Choose and save an inclusive range. ±10% is an optional product
              tracking preference.
            </Text>
            <View style={styles.row}>
              <Action
                label="Use target tolerance"
                selected={config.calorieMode === "tolerance"}
                onPress={() =>
                  setConfig({ ...config, calorieMode: "tolerance" })
                }
              />
              <Action
                label="Use custom range"
                selected={config.calorieMode === "range"}
                onPress={() =>
                  setConfig({
                    ...config,
                    calorieMode: "range",
                    lower: config.lower ?? (Math.round(target * 0.9) || 1),
                    upper: config.upper ?? (Math.round(target * 1.1) || 1),
                  })
                }
              />
            </View>
            {config.calorieMode === "tolerance" ? (
              <>
                <TextInput
                  accessibilityLabel="Calorie tolerance percent"
                  keyboardType="decimal-pad"
                  value={String(config.tolerance * 100)}
                  onChangeText={(v) =>
                    setConfig({ ...config, tolerance: Number(v) / 100 })
                  }
                  style={styles.input}
                />
                <Text style={styles.copy}>
                  {target > 0
                    ? `${target * (1 - config.tolerance)} – ${target * (1 + config.tolerance)} cal, inclusive`
                    : "Set a positive calorie target in Profile."}
                </Text>
              </>
            ) : (
              <>
                <TextInput
                  accessibilityLabel="Calorie range lower"
                  keyboardType="decimal-pad"
                  value={String(config.lower ?? "")}
                  onChangeText={(v) =>
                    setConfig({ ...config, lower: Number(v) })
                  }
                  style={styles.input}
                />
                <TextInput
                  accessibilityLabel="Calorie range upper"
                  keyboardType="decimal-pad"
                  value={String(config.upper ?? "")}
                  onChangeText={(v) =>
                    setConfig({ ...config, upper: Number(v) })
                  }
                  style={styles.input}
                />
              </>
            )}
          </>
        ) : null}
        {habit === "reminder" ? (
          <>
            <Text style={styles.copy}>
              On this device. Schedule edits apply to streaks from the next
              local day.
            </Text>
            {data.reminders
              .filter((r) => r.repeat !== "once")
              .map((r) => (
                <Action
                  key={r.id}
                  selected={config.reminderId === r.id}
                  label={`${config.reminderId === r.id ? "✓ " : ""}${reminderTitle(r)}`}
                  onPress={() => setConfig({ ...config, reminderId: r.id })}
                />
              ))}
          </>
        ) : null}
        <Text style={styles.copy}>
          Streak settings take effect {effectiveRuleDay(habit, !!existing, now)}
          . Numerical health targets are edited in Profile and apply to streaks
          from the next day. Earlier history is not backfilled with today's
          goals.
        </Text>
        {message ? (
          <Text accessibilityRole="alert" style={styles.copy}>
            {message}
          </Text>
        ) : null}
        <Action
          label={busy ? "Saving streak…" : "Save streak settings"}
          disabled={busy}
          onPress={() => {
            const parsed = ruleConfigSchema.safeParse(config);
            if (!parsed.success) {
              setMessage(parsed.error.issues[0].message);
              return;
            }
            setBusy(true);
            void saveRule(user, habit, enabled, parsed.data)
              .then(() => {
                reload();
                close();
              })
              .catch((e) =>
                setMessage(
                  e instanceof Error ? e.message : "Could not save settings.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        />
        <Text accessibilityRole="header" style={styles.title}>
          Recorded periods
        </Text>
        {result.periods
          .slice(-60)
          .reverse()
          .map((p) => (
            <Text key={p.day} style={styles.copy}>
              {p.day} · {stateLabel(p.state)} · {Math.round(p.count * 10) / 10}/
              {Math.round(p.target * 10) / 10}
              {p.provisional ? " · current period" : ""}
              {p.explanation === "goal_unavailable"
                ? " · historical target unavailable"
                : p.explanation === "paused"
                  ? " · paused"
                  : ""}
            </Text>
          ))}
        <Text style={styles.copy}>
          Device-local dates, Monday–Sunday weeks. Traveling can change
          historical day grouping; food days may need reconfirmation. Scheduled
          off-days are neutral.
        </Text>
      </ScrollView>
    </Modal>
  );
}
const styles = StyleSheet.create({
  card: { ...surfaces.card, padding: 16, gap: 10 },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: "600" },
  value: { color: colors.text, fontSize: 26, fontWeight: "700" },
  copy: { color: colors.secondary, fontSize: 14, lineHeight: 21 },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.separator,
    borderRadius: 10,
    padding: 12,
    color: colors.text,
  },
});
