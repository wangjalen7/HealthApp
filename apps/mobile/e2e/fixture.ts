import { test as base, expect, type Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
type Row = Record<string, unknown>;
export type Backend = { tables: Record<string, Row[]>; failNextWrite?: string };

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
      const rows = (backend.tables[table] ??= []);
      const matches = (row: Row) =>
        [...url.searchParams].every(([key, value]) => {
          if (value.startsWith("eq."))
            return String(row[key]) === value.slice(3);
          if (value === "is.null") return row[key] == null;
          if (value.startsWith("gte."))
            return String(row[key]) >= value.slice(4);
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
