import { test, expect, signIn } from "./fixture";
import { habits, habitLabels } from "../src/features/summary/layout";
import { createReminder } from "../src/features/reminders/model";

const user = "11111111-1111-4111-8111-111111111111";
const key = `healthapp:summary-layout:${user}`;

test("all streak choices are discoverable and saved changes preserve logging progress across reloads", async ({ page, backend }, info) => {
  await page.emulateMedia({reducedMotion: "reduce"});
  await page.clock.setFixedTime(new Date(2026, 9, 11, 12));
  const selected = ["calorie_target", "protein_target", "fluid_target", "training"];
  backend.tables.streak_rules = [...selected, "food_logging"].map(habit => ({
    user_id: user, habit, activation_day: "2026-10-10", effective_day: "2026-10-10",
    enabled: true, version: 1, config: { calorieMode: "under", trainingDays: 3 },
  }));
  const originalRules = structuredClone(backend.tables.streak_rules);
  backend.tables.nutrition_entries = [10, 11].map(day => ({
    id: `food-${day}`, user_id: user, food_name: "Synthetic food", calories: 400,
    protein_grams: 30, occurred_at: new Date(2026, 9, day, 9).toISOString(),
  }));
  await page.goto("/sign-in");
  await page.evaluate(({key, selected}) => localStorage.setItem(key, JSON.stringify({
    version: 1, widgets: [{ id: "habits", type: "streaks", size: "wide", config: { habits: selected } }],
  })), {key, selected});
  await signIn(page);
  await page.getByRole("button", {name: "Edit Streaks widget", exact: true}).click();
  for (const habit of habits) {
    await expect(page.getByRole("checkbox", {name: habitLabels[habit], exact: true})).toHaveCount(1);
  }
  await page.getByRole("checkbox", {name: "Food logging", exact: true}).click();
  await page.getByRole("checkbox", {name: "Weight logging", exact: true}).click();
  await page.getByRole("button", {name: "Save changes", exact: true}).click();
  const food = page.getByRole("button", {name: "Food logging streak details", exact: true});
  await expect(food).toContainText("2 days");
  expect(backend.tables.streak_rules.filter(r => r.habit !== "weight")).toEqual(originalRules);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).widgets[0].config.habits.length, key)).toBe(6);
  await food.click();
  await expect(page.getByText("Recorded periods", {exact:true})).toHaveCount(0);
  await expect(page.getByRole("switch", {name:"Enable this streak",exact:true})).toHaveCount(0);
  await page.getByRole("button", {name: "Dismiss Food logging", exact:true}).click();
  await page.reload();
  await signIn(page);
  await expect(food).toContainText("2 days");
  await page.getByRole("button", {name:"Edit Streaks widget",exact:true}).click();
  await expect(page.getByRole("checkbox", {name:"Food logging",exact:true})).toHaveAttribute("aria-checked","true");
  await page.getByRole("checkbox", {name:"Food logging",exact:true}).click();
  await page.getByRole("button", {name:"Save changes",exact:true}).click();
  await expect(food).toHaveCount(0);
  await page.reload();
  await signIn(page);
  await expect(food).toHaveCount(0);
  await page.getByRole("button", {name:"Edit Streaks widget",exact:true}).click();
  await page.getByRole("checkbox", {name:"Food logging",exact:true}).click();
  await page.getByRole("button", {name:"Save changes",exact:true}).click();
  await expect(food).toContainText("2 days");
  expect(backend.tables.streak_rules.filter(r => r.habit === "food_logging")).toEqual(originalRules.filter(r => r.habit === "food_logging"));
  await expect(page.getByTestId("sustain-entry-cover")).toHaveCount(0);
  await page.screenshot({path: info.outputPath("streaks-restored.png")});
  await page.getByRole("button", {name:"Edit Streaks widget",exact:true}).click();
  await page.screenshot({path: info.outputPath("streak-editor.png")});
});

test("reminder streak selection saves locally without calling the server initializer for reminders", async ({page, backend}, info) => {
  await page.emulateMedia({reducedMotion:"reduce", colorScheme:"dark"});
  await page.setViewportSize({width:320,height:740});
  const reminder = createReminder({userId:user,kind:"custom",name:"Read",repeat:"daily",time:"09:00",additionalTimes:[],startDate:"2026-10-01",weekdays:[]});
  await page.goto("/sign-in");
  await page.evaluate(({key, user, reminder}) => {
    localStorage.setItem(`healthapp:reminders:${user}`,JSON.stringify([reminder]));
    localStorage.setItem(key,JSON.stringify({version:1,widgets:[{id:"habit",type:"streaks",size:"wide",config:{habits:["food_logging"]}}]}));
  },{key,user,reminder});
  await page.route("**/rest/v1/rpc/initialize_summary_streaks",async route=>{
    expect(route.request().postDataJSON().p_habits).not.toContain("reminder");
    await route.fallback();
  });
  await signIn(page);
  await page.getByRole("button",{name:"Edit Streaks widget",exact:true}).click();
  await page.getByRole("checkbox",{name:"Reminder consistency",exact:true}).click();
  await page.getByRole("checkbox",{name:"Read",exact:true}).click();
  await expect(page.getByRole("checkbox",{name:"Read",exact:true})).toHaveAttribute("aria-checked","true");
  await page.screenshot({path:info.outputPath("streak-reminder-editor-dark-320.png")});
  await page.getByRole("button",{name:"Save changes",exact:true}).click();
  await expect(page.getByRole("button",{name:"Reminder consistency streak details",exact:true})).toBeVisible();
  expect(backend.tables.streak_rules.some(row=>row.habit==="reminder")).toBe(false);
  const local = await page.evaluate(user=>JSON.parse(localStorage.getItem(`healthapp:streak-local:${user}`)!),user);
  expect(local.rules[0].config.reminderId).toBe(reminder.id);
  const saved = await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
  expect(saved.widgets[0].config.reminderId).toBe(reminder.id);
});

test("Summary gallery can add a logging streak beyond existing goal cards", async ({page, backend}) => {
  await page.goto("/sign-in");
  const goals = ["calorie_target", "protein_target", "fluid_target", "training"];
  await page.evaluate(({key, goals}) => localStorage.setItem(key, JSON.stringify({
    version:1, widgets:goals.map(habit=>({id:habit,type:"streaks",size:"small",config:{habits:[habit]}})),
  })), {key,goals});
  await signIn(page);
  const before = structuredClone(backend.tables.streak_rules);
  await page.getByRole("button", {name:"Edit Summary",exact:true}).click();
  await page.getByRole("button", {name:"Add widget",exact:true}).click();
  await page.getByRole("button", {name:"Add Streaks",exact:true}).click();
  await page.getByRole("button", {name:"Customize Streaks",exact:true}).last().click();
  for (const habit of habits) await expect(page.getByRole("checkbox", {name:habitLabels[habit],exact:true})).toHaveCount(1);
  await page.getByRole("button", {name:"Back to layout",exact:true}).click();
  await page.getByRole("button", {name:"Done",exact:true}).click();
  await expect(page.getByRole("button", {name:"Daily logging streak details",exact:true})).toBeVisible();
  expect(backend.tables.streak_rules.length).toBeGreaterThanOrEqual(before?.length ?? 0);
});
