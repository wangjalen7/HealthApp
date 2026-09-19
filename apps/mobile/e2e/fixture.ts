import { test as base, expect, type Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;
export type Backend = {
  tables: Record<string, Row[]>;
  failNextWrite?: string;
  loseNextResponse?: string;
  pageSize?: number;
  failReads?: Record<string, { code: string; message: string }>;
};

// Synthetic account and API responses: no health records or credentials leave the browser.
export const test = base.extend<{ backend: Backend }>({
  backend: async ({ page }, use) => {
    const user = {
      id: userId,
      email: "review@example.com",
      aud: "authenticated",
      role: "authenticated",
      created_at: new Date().toISOString(),
      app_metadata: { provider: "email" },
      user_metadata: { first_name: "Review", last_name: "Tester" },
    };
    const profile = {
      id: userId,
      first_name: "Review",
      last_name: "Tester",
      daily_calorie_goal: 2200,
      daily_protein_goal: 150,
      daily_water_goal_ml: 2400,
      weight_goal_lb: 180,
      bp_systolic_goal: 120,
      bp_diastolic_goal: 80,
    };
    const backend: Backend = { tables: { profiles: [profile] } };
    const receipts = new Map<string, { request: string; response: unknown }>();
    let vitalSequence = 0;
    const jwt =
      [
        { alg: "HS256", typ: "JWT" },
        {
          sub: userId,
          aud: "authenticated",
          role: "authenticated",
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      ]
        .map((value) =>
          Buffer.from(JSON.stringify(value)).toString("base64url"),
        )
        .join(".") + ".synthetic-signature";
    await page.route(/https:\/\/[^/]+\.supabase\.(co|com)\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const method = request.method();
      const json = async (body: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      if (url.pathname.endsWith("/token"))
        return json({
          access_token: jwt,
          token_type: "bearer",
          expires_in: 3600,
          refresh_token: "synthetic-refresh",
          user,
        });
      if (url.pathname.endsWith("/user")) {
        if (method === "PUT")
          Object.assign(user.user_metadata, request.postDataJSON().data);
        return json(user);
      }
      if (url.pathname.endsWith("/logout"))
        return route.fulfill({ status: 204 });
      if (url.pathname.endsWith("/recover")) return json({});
      if (!url.pathname.startsWith("/rest/v1/"))
        return json({ message: "Unsupported isolated test request" }, 400);
      if (url.pathname === "/rest/v1/rpc/require_active_session")
        return json(null);
      if (url.pathname === "/rest/v1/rpc/read_vital_changes") {
        const input = request.postDataJSON();
        const all = (backend.tables.vital_samples ??= []);
        for (const row of all) {
          row.version ??= 1;
          row.change_seq ??= ++vitalSequence;
        }
        const through =
          input.p_through ??
          Math.max(0, ...all.map((r) => Number(r.change_seq)));
        const rows = all
          .filter(
            (r) =>
              Number(r.change_seq) > input.p_after &&
              Number(r.change_seq) <= through,
          )
          .sort((a, b) => Number(a.change_seq) - Number(b.change_seq))
          .slice(0, Math.min(input.p_limit, backend.pageSize ?? 200));
        const cursor = rows.length ? rows.at(-1)!.change_seq : through;
        return json({
          rows,
          through,
          cursor,
          done: cursor === through || !rows.length,
        });
      }
      if (url.pathname === "/rest/v1/rpc/commit_health_mutation") {
        const input = request.postDataJSON();
        const op = input.p_request;
        const fingerprint = JSON.stringify(op);
        const receipt = receipts.get(input.p_operation_id);
        if (receipt)
          return receipt.request === fingerprint
            ? json(receipt.response)
            : json({ code: "22023", message: "Operation ID reused" }, 400);
        const table =
          op.action === "goals"
            ? "profiles"
            : op.action.includes("workout")
              ? "workout_sessions"
              : op.table;
        if (
          backend.failNextWrite === table ||
          (op.action.includes("workout") &&
            backend.failNextWrite === "workout_sets")
        ) {
          backend.failNextWrite = undefined;
          return json(
            { message: "Test connection unavailable. Try again." },
            503,
          );
        }
        let data: unknown;
        if (op.action === "goals") {
          for (const key of Object.keys(op.changes))
            if (
              JSON.stringify((profile as Row)[key] ?? null) !==
              JSON.stringify(op.baseline[key] ?? null)
            )
              return json({ status: "conflict", field: key, current: profile });
          Object.assign(profile, op.changes);
          data = { ...profile };
        } else if (op.action.includes("workout")) {
          const rows = (backend.tables.workout_sessions ??= []);
          const current = rows.find((r) => r.id === op.id);
          if (
            op.action === "replace_workout" &&
            (!current || Number(current.version ?? 1) !== op.version)
          )
            return json({ status: "conflict", current: current ?? null });
          const row = {
            ...current,
            id: op.id,
            user_id: userId,
            title: op.title,
            muscle_groups: op.muscle_groups,
            location: op.location,
            notes: op.notes,
            completed_at: current?.completed_at ?? op.occurred_at,
            started_at: current?.started_at ?? op.occurred_at,
            version: Number(current?.version ?? 0) + 1,
          };
          backend.tables.workout_sessions = [
            ...rows.filter((r) => r.id !== op.id),
            row,
          ];
          backend.tables.workout_sets = [
            ...(backend.tables.workout_sets ?? []).filter(
              (r) => r.session_id !== op.id,
            ),
            ...op.sets.map((set: Row) => ({
              ...set,
              user_id: userId,
              session_id: op.id,
              created_at: new Date().toISOString(),
            })),
          ];
          data = { ...row, sets: op.sets };
        } else {
          const rows = (backend.tables[table] ??= []);
          for (const item of op.rows) {
            const current = rows.find((r) => r.id === item.id);
            if (
              op.action !== "create" &&
              (!current ||
                current.deleted_at ||
                Number(current.version ?? 1) !== item.version)
            )
              return json({
                status: "conflict",
                id: item.id,
                current: current ?? null,
              });
          }
          const result: Row[] = [];
          for (const item of op.rows) {
            const current = rows.find((r) => r.id === item.id);
            if (
              op.action === "delete" &&
              !["vital_samples", "cardio_entries"].includes(table)
            ) {
              backend.tables[table] = backend.tables[table].filter(
                (r) => r.id !== item.id,
              );
              result.push(current!);
            } else {
              const row = {
                ...current,
                ...item.values,
                id: item.id,
                user_id: userId,
                version: Number(current?.version ?? 0) + 1,
                created_at: current?.created_at ?? new Date().toISOString(),
                ...(op.action === "delete"
                  ? { deleted_at: new Date().toISOString() }
                  : {}),
                ...(table === "vital_samples"
                  ? { change_seq: ++vitalSequence }
                  : {}),
              };
              if (current) Object.assign(current, row);
              else rows.push(row);
              result.push(row);
            }
          }
          data = result;
        }
        const response = { status: "accepted", data };
        receipts.set(input.p_operation_id, { request: fingerprint, response });
        if (backend.loseNextResponse === table) {
          backend.loseNextResponse = undefined;
          return route.abort("failed");
        }
        return json(response);
      }
      if (url.pathname === "/rest/v1/rpc/ensure_streak_tracking") {
        const input = request.postDataJSON();
        backend.tables.streak_rules ??= [
          {
            user_id: userId,
            habit: "daily_logging",
            effective_day: input.p_day,
            activation_day: input.p_day,
            enabled: true,
            version: 1,
            config: {},
          },
        ];
        backend.tables.streak_goal_snapshots ??= [
          {
            user_id: userId,
            effective_day: input.p_day,
            calorie_goal: profile.daily_calorie_goal,
            protein_goal: profile.daily_protein_goal,
            fluid_goal_ml: profile.daily_water_goal_ml,
            protein_source: "profile",
          },
        ];
        return json(null);
      }
      if (url.pathname === "/rest/v1/rpc/save_daily_goals_with_history") {
        if (backend.failNextWrite === "profiles") {
          backend.failNextWrite = undefined;
          return json(
            { message: "Test connection unavailable. Try again." },
            503,
          );
        }
        Object.assign(profile, request.postDataJSON().p_goals);
        return json(null);
      }
      if (url.pathname === "/rest/v1/rpc/set_food_day_complete") {
        const input = request.postDataJSON();
        backend.tables.food_day_completions = (
          backend.tables.food_day_completions ?? []
        ).filter((r) => r.local_day !== input.p_day);
        if (input.p_complete)
          backend.tables.food_day_completions.push({
            user_id: userId,
            local_day: input.p_day,
            time_zone: input.p_zone,
            confirmed_at: new Date().toISOString(),
            fingerprint: "fixture",
          });
        return json(null);
      }
      if (url.pathname === "/rest/v1/rpc/save_streak_rule") {
        const input = request.postDataJSON();
        const today = new Date();
        const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        (backend.tables.streak_rules ??= []).push({
          user_id: userId,
          habit: input.p_habit,
          effective_day: key,
          activation_day: key,
          enabled: input.p_enabled,
          version: 1,
          config: input.p_config,
        });
        return json(null);
      }
      if (url.pathname === "/rest/v1/rpc/replace_workout_session") {
        const input = request.postDataJSON();
        const session = backend.tables.workout_sessions.find(
          (row) => row.id === input.p_session_id,
        );
        if (!session) return json({ message: "Workout not found" }, 404);
        Object.assign(session, {
          title: input.p_title,
          muscle_groups: input.p_muscle_groups,
          location: input.p_location,
          notes: input.p_notes,
        });
        backend.tables.workout_sets = [
          ...backend.tables.workout_sets.filter(
            (row) => row.session_id !== input.p_session_id,
          ),
          ...input.p_sets.map((row: Row) => ({
            ...row,
            user_id: userId,
            session_id: input.p_session_id,
          })),
        ];
        return json(null);
      }
      const table = url.pathname.split("/").at(-1)!;
      if (method === "GET" && backend.failReads?.[table])
        return json(backend.failReads[table], 400);
      const rows = (backend.tables[table] ??= []);
      for (const row of rows) row.version ??= 1;
      const matches = (row: Row) =>
        [...url.searchParams].every(([key, value]) => {
          if (value.startsWith("eq."))
            return String(row[key]) === value.slice(3);
          if (value === "is.null") return row[key] == null;
          if (value.startsWith("gte."))
            return String(row[key]) >= value.slice(4);
          if (value.startsWith("gt.")) return String(row[key]) > value.slice(3);
          if (value.startsWith("lt.")) return String(row[key]) < value.slice(3);
          return true;
        });
      if (method !== "GET" && backend.failNextWrite === table) {
        backend.failNextWrite = undefined;
        return json(
          { message: "Test connection unavailable. Try again." },
          503,
        );
      }
      if (method === "POST") {
        const input = request.postDataJSON();
        for (const row of Array.isArray(input) ? input : [input]) {
          const existing = rows.find((value) => value.id === row.id);
          if (existing) Object.assign(existing, row);
          else rows.push({ created_at: new Date().toISOString(), ...row });
        }
        return json(
          request.headers().accept?.includes("vnd.pgrst.object")
            ? rows.at(-1)
            : rows,
          201,
        );
      }
      if (method === "PATCH") {
        rows
          .filter(matches)
          .forEach((row) => Object.assign(row, request.postDataJSON()));
        return json(
          request.headers().accept?.includes("vnd.pgrst.object")
            ? rows.filter(matches)[0]
            : rows.filter(matches),
        );
      }
      if (method === "DELETE") {
        backend.tables[table] = rows.filter((row) => !matches(row));
        return route.fulfill({ status: 204 });
      }
      const found = rows
        .filter(matches)
        .sort((a, b) => {
          const order = url.searchParams.get("order");
          if (!order) return 0;
          for (const term of order.split(",")) {
            const [key, direction] = term.split(".");
            const difference = String(a[key] ?? "").localeCompare(
              String(b[key] ?? ""),
            );
            if (difference)
              return direction === "desc" ? -difference : difference;
          }
          return 0;
        })
        .slice(
          Number(url.searchParams.get("offset") ?? 0),
          Number(url.searchParams.get("offset") ?? 0) +
            Math.min(
              Number(url.searchParams.get("limit") ?? rows.length),
              backend.pageSize ?? Infinity,
            ),
        )
        .map((row) =>
          table === "workout_sessions"
            ? {
                ...row,
                workout_sets:
                  backend.tables.workout_sets?.filter(
                    (set) => set.session_id === row.id,
                  ) ?? [],
              }
            : row,
        );
      return json(
        request.headers().accept?.includes("vnd.pgrst.object")
          ? (found[0] ?? null)
          : found,
      );
    });
    await use(backend);
  },
});

export async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page
    .getByPlaceholder("Email", { exact: true })
    .fill("review@example.com");
  await page
    .getByPlaceholder("Password", { exact: true })
    .fill("synthetic-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Hi Review,", { exact: true })).toBeVisible();
}

export async function quickLog(page: Page, title: string) {
  await page.getByRole("button", { name: "Create a new health log" }).click();
  await page
    .getByRole("button", { name: `Open ${title}`, exact: true })
    .click();
}
export { expect };
