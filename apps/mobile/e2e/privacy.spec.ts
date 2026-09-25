import { test, expect, signIn, quickLog } from "./fixture";

test("legal drafts are available signed out and signed in, with readable narrow dark layout",async({page,backend},info)=>{
  expect(backend.tables.profiles).toHaveLength(1);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/sign-in");
  await page.getByRole("link",{name:"Privacy & Legal",exact:true}).click();
  await expect(page.getByText("Development draft",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Privacy Policy",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Your account and information",exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath("privacy-signed-out.png")});
  await page.setViewportSize({width:320,height:740});
  await page.emulateMedia({colorScheme:"dark",reducedMotion:"reduce"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath("privacy-dark-320.png")});
  await signIn(page);
  await page.getByRole("tab",{name:"Profile",exact:true}).first().click();
  await page.getByRole("button",{name:"Privacy & Legal",exact:true}).click();
  await expect(page.getByRole("switch",{name:"Detailed notification previews",exact:true})).not.toBeChecked();
  await page.getByRole("button",{name:"Privacy & Legal documents",exact:true}).click();
  await page.getByRole("button",{name:"Consumer Health Data Privacy Policy",exact:true}).click();
  await expect(page.getByText("Separate health-data notice — draft",{exact:true})).toBeVisible();
});

test("privacy deletion is confirmed, failures recover, and draft clearing preserves another account",async({page,backend})=>{
  const user="11111111-1111-4111-8111-111111111111";
  await signIn(page);
  await page.evaluate(user=>{
    localStorage.setItem(`healthapp:goal-helper-draft:${user}:calories`,JSON.stringify({age:"30"}));
    localStorage.setItem("healthapp:goal-helper-draft:other:calories",JSON.stringify({age:"40"}));
  },user);
  await page.getByRole("tab",{name:"Profile",exact:true}).first().click();
  await page.getByRole("button",{name:"Privacy & Legal",exact:true}).click();
  await page.getByRole("button",{name:"Clear unfinished drafts",exact:true}).click();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  expect(await page.evaluate(user=>localStorage.getItem(`healthapp:goal-helper-draft:${user}:calories`),user)).not.toBeNull();
  await page.getByRole("button",{name:"Clear unfinished drafts",exact:true}).click();
  await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(page.getByText(/Unfinished local drafts cleared/)).toBeVisible();
  expect(await page.evaluate(user=>localStorage.getItem(`healthapp:goal-helper-draft:${user}:calories`),user)).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem("healthapp:goal-helper-draft:other:calories"))).not.toBeNull();
  let calls=0;
  await page.route("**/rest/v1/rpc/clear_saved_ai_data",async route=>{calls++;await route.fulfill({status:calls===1?503:200,contentType:"application/json",body:calls===1?JSON.stringify({message:"Synthetic failure"}):"null"});});
  await page.getByRole("button",{name:"Delete saved planner data",exact:true}).click();
  await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(page.getByText(/Saved AI data could not be deleted/).last()).toBeVisible();
  await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(page.getByText(/Saved planner data deleted/)).toBeVisible();
  expect(calls).toBe(2);expect(backend.tables.profiles).toHaveLength(1);
});

test("chart readings and dates have a non-gesture path and sheet focus",async({page,backend},info)=>{
  expect(backend.tables.profiles).toHaveLength(1);
  await page.emulateMedia({reducedMotion:"reduce"});
  await signIn(page);
  await page.getByRole("button",{name:"View chart data and dates",exact:true}).first().click();
  await expect(page.getByRole("heading",{name:"Chart data",exact:true})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Chart data",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"Earlier period",exact:true}).click();
  await expect(page.getByText(/same aggregated values shown/)).toBeVisible();
  await page.screenshot({path:info.outputPath("chart-accessible-data.png")});
  await page.getByRole("button",{name:"Dismiss Chart data",exact:true}).click();
  await expect(page.getByRole("button",{name:"View chart data and dates",exact:true}).first()).toBeFocused();
});

test("clearing a draft also clears the retained logging form and cannot repersist it",async({page,backend})=>{
  expect(backend.tables.profiles).toHaveLength(1);
  await signIn(page);
  await quickLog(page,"Food");
  await page.getByRole("radio",{name:"breakfast",exact:true}).click();
  await page.getByRole("tab",{name:"Profile",exact:true}).first().click();
  await page.getByRole("button",{name:"Privacy & Legal",exact:true}).click();
  await page.getByRole("button",{name:"Clear unfinished drafts",exact:true}).click();
  await page.getByRole("button",{name:"Delete",exact:true}).click();
  await expect(page.getByText(/Unfinished local drafts cleared/)).toBeVisible();
  await quickLog(page,"Food");
  await expect(page.getByRole("radio",{name:"breakfast",exact:true})).not.toBeChecked();
  expect(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes("nutrition-draft")).map(k=>localStorage.getItem(k)))).toEqual([]);
});
