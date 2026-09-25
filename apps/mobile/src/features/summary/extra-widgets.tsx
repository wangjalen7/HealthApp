import { IntegerSlider } from "../../ui/integer-slider";
import { SegmentedControl } from "../../ui/segmented-control";
import { SettingsSheet, ChoiceRow } from "../../ui/settings-sheet";
import { WidgetHeading, widgetStyles } from "./widget-design";
import { todaysMeals } from "./meals";
import { streakWeek } from "./streak-week";
import { useRef, useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Pressable } from "../../ui/pressable";
import { colors } from "../../ui/theme";
import { muscleGroupLabel } from "../training/workout-draft";
import { Icon } from "../../ui/icon";
import { widgetIdentity } from "./widget-design";
import { dayKey } from "./calendar";
import { habitLabels, actionRoutes, type Habit, type Widget } from "./layout";
import { type SummaryData } from "./data";
import { trainingSummary } from "./training";
import { evaluateStreak } from "../streaks/engine";
import {
  explanations,
  ruleConfigSchema,
  type RuleConfig,
} from "../streaks/model";
import { effectiveRuleDay, saveRule } from "../streaks/repository";
import { weekdayLabels, reminderTitle } from "../reminders/model";
import { Action } from "./dashboard";
import { WidgetSkeleton } from "./widget-skeleton";
export function ExtraWidget({
  widget,
  data,
  now,
  user,
  reload,
  error,
}: {
  widget: Widget;
  data?: SummaryData;
  now: Date;
  user: string;
  reload: () => void;
  loading: boolean;
  error?: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Habit>();
  const verified = useRef(new Map<Habit, { current: number; best: number }>());
  if (!data && widget.type !== "actions")
    return (
      <WidgetSkeleton
        widget={widget}
        error={error}
        retry={<Action label="Retry widget" onPress={reload} />}
      />
    );
  const stale = null;
  if (widget.type === "meals") {
    const meals = todaysMeals(data!.sources.food, now);
    return (
      <View style={styles.card}>
        <WidgetHeading type="meals" title="Today's Meals" />
        {stale}
        {!data!.sources.coverage.food?.complete ? (
          <>
            <Text style={styles.copy}>Meals could not be loaded.</Text>
            <Action label="Retry meals" onPress={reload} />
          </>
        ) : (
          <>
            {!meals.length ? (
              <Text style={styles.copy}>No meals saved today.</Text>
            ) : (
              meals.slice(0, 5).map((meal) => (
                <Pressable
                  key={meal.id}
                  accessibilityRole="button"
                  accessibilityLabel={
                    meal.title +
                    ", " +
                    Math.round(meal.calories) +
                    " calories. Open food history"
                  }
                  onPress={() =>
                    router.push({
                      pathname: "/(app)/history",
                      params: { view: "food" },
                    })
                  }
                  style={{ paddingVertical: 8, gap: 4 }}
                >
                  <View style={{ flexDirection: "row", gap: 12 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.title,
                        { flex: 1, textTransform: "capitalize" },
                      ]}
                    >
                      {meal.title}
                    </Text>
                    <Text style={styles.title}>
                      {Math.round(meal.calories)} cal
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.copy}>
                    {meal.names.join(", ")}
                  </Text>
                  <Text style={styles.copy}>
                    {new Date(meal.at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    · {Math.round(meal.protein)} g protein
                  </Text>
                </Pressable>
              ))
            )}
            {meals.length ? (
              <Text style={styles.copy}>
                {Math.round(
                  meals.reduce((sum, meal) => sum + meal.calories, 0),
                )}{" "}
                cal today · {meals.length}{" "}
                {meals.length === 1 ? "meal" : "meals"}
              </Text>
            ) : null}
            <Action
              label={meals.length ? "View all food" : "Log a meal"}
              onPress={() =>
                router.push(
                  meals.length
                    ? { pathname: "/(app)/history", params: { view: "food" } }
                    : "/(app)/nutrition",
                )
              }
            />
          </>
        )}
      </View>
    );
  }
  if (widget.type === "actions")
    return (
      <View style={styles.card}>
        <WidgetHeading type="actions" title="Quick Actions" />
        <View style={styles.row}>
          {widget.config.actions?.map((action) => (
            <Pressable
              key={action}
              accessibilityRole="button"
              onPress={() => router.push(actionRoutes[action])}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                backgroundColor: colors.background,
                borderRadius: 14,
                padding: 12,
                flexBasis: widget.size === "small" ? "100%" : "46%",
                flexGrow: 1,
              }}
            >
              <Icon
                name={
                  widgetIdentity[
                    action === "Workout"
                      ? "training"
                      : action === "Food"
                        ? "meals"
                        : action === "Fluids"
                          ? "fluids"
                          : action === "Weight"
                            ? "weight"
                            : action === "Blood pressure"
                              ? "bp"
                              : "streaks"
                  ].icon
                }
                color={
                  widgetIdentity[
                    action === "Workout"
                      ? "training"
                      : action === "Food"
                        ? "meals"
                        : action === "Fluids"
                          ? "fluids"
                          : action === "Weight"
                            ? "weight"
                            : action === "Blood pressure"
                              ? "bp"
                              : "streaks"
                  ].color
                }
                size={22}
              />
              <Text style={[styles.title, { flex: 1, fontSize: 15 }]}>
                {action === "Workout" && data?.workoutDraft
                  ? "Resume workout"
                  : action === "Food" && data?.mealDraft
                    ? "Resume meal"
                    : action}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  if (!data) return null;
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
        <WidgetHeading type="training" title="Training" />
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
  if (widget.type !== "streaks") return null;
  return (
    <View style={styles.card}>
      <WidgetHeading type="streaks" title="Streaks" />
      {stale}
      {widget.config.habits?.map((habit) => {
        const result = evaluateStreak(habit, data.rules, data.sources, now),
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
              <Text style={styles.copy}>
                Save this layout to begin tracking
              </Text>
            ) : (
              <>
                <Text style={styles.value}>
                  {result.unknown ? "Unverified" : result.current}{" "}
                  {habit === "training" ? "week streak" : "days"}
                </Text>
                {result.unknown && previous ? (
                  <Text style={styles.copy}>
                    Last verified: {previous.current}{" "}
                    {habit === "training" ? "weeks" : "days"} · stale until
                    history is available
                  </Text>
                ) : null}
                {habit === "training" && period ? (
                  <Text style={styles.copy}>
                    {period.count} of {period.target} days this week
                  </Text>
                ) : null}
                <Text style={styles.copy}>
                  Best streak:{" "}
                  {result.unknown && previous ? previous.best : result.best}{" "}
                  {habit === "training" ? "weeks" : "days"}
                  {result.unknown ? " · incomplete coverage" : ""}
                </Text>
                <Text style={styles.copy}>This week</Text>
                <View
                  testID={`streak-week-${habit}`}
                  style={{ flexDirection: "row" }}
                >
                  {streakWeek(habit, result.periods, now).map(
                    ({ day, label, state }) => (
                      <View
                        key={day}
                        accessible
                        accessibilityLabel={`${day}: ${stateLabel(state)}`}
                        style={{ flex: 1, alignItems: "center", gap: 5 }}
                      >
                        <Text style={{ color: colors.secondary, fontSize: 12 }}>
                          {label}
                        </Text>
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor:
                              state === "met" ? colors.green : colors.fill,
                          }}
                        >
                          {state === "met" ? (
                            <Icon
                              name="check"
                              color={colors.onAccent}
                              size={16}
                            />
                          ) : state === "unknown" ? (
                            <Text
                              style={{ color: colors.secondary, fontSize: 12 }}
                            >
                              ?
                            </Text>
                          ) : state === "not_scheduled" ||
                            state === "not_tracked" ? (
                            <Icon
                              name="minus"
                              color={colors.tertiary}
                              size={12}
                            />
                          ) : null}
                        </View>
                        <Text style={{ color: colors.secondary, fontSize: 11 }}>
                          {Number(day.slice(8))}
                        </Text>
                      </View>
                    ),
                  )}
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
        upcoming: "Upcoming",
        not_tracked: "Before tracking began",
        met: "Goal reached",
        open: "In progress",
        not_met: "No qualifying log",
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
  const router = useRouter();
  const existing = data.rules
    .filter((r) => r.habit === habit)
    .sort((a, b) => a.effective_day.localeCompare(b.effective_day))
    .at(-1);
  const [config, setConfig] = useState<RuleConfig>({
    ...(existing?.config ?? ruleConfigSchema.parse({})),
    calorieMode: existing?.config.calorieMode === "over" ? "over" : "under",
  });
  const [enabled, setEnabled] = useState(existing?.enabled ?? true),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const result = evaluateStreak(habit, data.rules, data.sources, now);
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
    <SettingsSheet title={habitLabels[habit]} icon="calendar" onClose={close}>
      <Text style={styles.copy}>{explanations[habit]}</Text>
      <Action
        label={`Open ${action} log`}
        onPress={() => {
          close();
          router.push(actionRoutes[action]);
        }}
      />
      <Text style={styles.copy}>
        Best streak: {result.best} {habit === "training" ? "weeks" : "days"}
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
        <IntegerSlider
          label="Training days per week"
          value={config.trainingDays}
          onChange={(trainingDays) => setConfig({ ...config, trainingDays })}
        />
      ) : null}
      {habit === "weight" ? (
        <>
          <Text style={styles.copy}>Scheduled weekdays</Text>
          <View style={styles.row}>
            {weekdayLabels.map((day, i) => (
              <ChoiceRow
                key={day}
                selected={config.weekdays.includes(i)}
                label={day}
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
          <Text style={styles.title}>
            {target > 0
              ? target + " cal target"
              : "Set a calorie goal in Profile"}
          </Text>
          <SegmentedControl
            label="Calorie target direction"
            value={config.calorieMode === "over" ? "over" : "under"}
            options={[
              { value: "under", label: "At or under" },
              { value: "over", label: "At or over" },
            ]}
            onChange={(calorieMode) => setConfig({ ...config, calorieMode })}
          />
          <Text style={styles.copy}>
            Uses saved food totals only. Empty days do not count. Today is
            provisional; adding, editing or deleting food recalculates progress.
          </Text>
        </>
      ) : null}
      {habit === "reminder" ? (
        <>
          <Text style={styles.copy}>
            On this device. Schedule edits apply to streaks from the next local
            day.
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
        Streak settings take effect {effectiveRuleDay(habit, !!existing, now)}.
        Numerical health targets are edited in Profile and apply to streaks from
        the next day. Earlier history is not backfilled with today's goals.
      </Text>
      {message ? (
        <Text accessibilityRole="alert" style={styles.copy}>
          {message}
        </Text>
      ) : null}
      <Action
        primary
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
        Device-local dates, Monday–Sunday weeks. Traveling can change historical
        day grouping. Scheduled off-days are neutral.
      </Text>
    </SettingsSheet>
  );
}
const styles = StyleSheet.create({
  card: widgetStyles.card,
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
