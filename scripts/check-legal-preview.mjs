import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = path.join(root, "dist", "legal-preview");
const policies = JSON.parse(
  fs.readFileSync(path.join(root, "legal", "policies.json"), "utf8"),
);
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "msedge" : undefined,
});
try {
  const page = await browser.newPage({
    viewport: { width: 320, height: 740 },
    colorScheme: "dark",
    reducedMotion: "reduce",
  });
  for (const slug of ["", ...policies.map((p) => p.slug), "licenses"]) {
    const url = pathToFileURL(path.join(site, slug, "index.html")).href;
    await page.goto(url);
    assert.equal(await page.locator("h1").count(), 1);
    assert.equal(await page.locator("script").count(), 0);
    assert.equal(await page.locator(".notice").count(), 1);
    for (const href of await page
      .locator("a")
      .evaluateAll((links) => links.map((a) => a.href))) {
      const local = fileURLToPath(href);
      assert.ok(local.startsWith(site));
      assert.ok(fs.existsSync(local));
    }
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      slug + " narrow overflow",
    );
    await page.addStyleTag({ content: "body{font-size:36px}" });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      slug + " 200% text overflow",
    );
    if (slug === "privacy")
      await page.screenshot({
        path: path.join(root, "dist", "privacy-public-320-large.png"),
      });
  }
  console.log(
    "PASS: nine standalone pages, local working links, no scripts, draft banners, dark 320px and 200% text without horizontal overflow.",
  );
} finally {
  await browser.close();
}
