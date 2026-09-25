import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(root, "legal", name), "utf8"));
const config = read("release.json");
const policies = read("policies.json");
const preview = process.argv.includes("--preview");
const required = [
  "operatorName",
  "operatorLocation",
  "supportEmail",
  "privacyEmail",
  "publicBaseUrl",
  "effectiveDate",
  "minimumAge",
  "monetization",
];
const missing = required.filter((key) => !config[key]);
if (
  !preview &&
  policies.some((p) => p.sections.some((s) => /draft/i.test(s.heading)))
)
  throw Error(
    "Legal release blocked: replace and review the draft policy content, not only release flags.",
  );
if (
  !preview &&
  (config.status !== "approved" ||
    missing.length ||
    !config.launchCountries.length ||
    !config.legalReviewCompleted ||
    !config.providerReviewCompleted ||
    !config.deviceReviewCompleted)
) {
  throw Error(
    "Legal release blocked: approve the reviewed notice and fill legal/release.json, including owner, territory, age, provider and device review. Missing: " +
      missing.join(", "),
  );
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const out = path.join(root, "dist", preview ? "legal-preview" : "legal-site");
fs.mkdirSync(out, { recursive: true });
const nav = policies
  .map((p) => `<a href="../${p.slug}/">${escape(p.title)}</a>`)
  .join("");
const frame = (title, body) =>
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer">${preview ? '<meta name="robots" content="noindex,nofollow">' : ""}<title>${escape(title)} | Sustain</title><style>body{margin:0;background:#f4f7f4;color:#173f2d;font:18px/1.65 system-ui,sans-serif}main{max-width:760px;margin:auto;padding:32px 24px}a{color:#215b3b;display:inline-block;padding:10px 8px}a:focus-visible{outline:3px solid #173f2d}h1{line-height:1.2}h2{font-size:1.25em;margin-top:2em}.notice{border:2px solid #715316;padding:16px;background:#fff6df;color:#513b10}nav{display:flex;flex-wrap:wrap;gap:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere}body{overflow-wrap:anywhere}a{max-width:100%;box-sizing:border-box}@media(prefers-color-scheme:dark){body{background:#0b1913;color:#edf4ee}a{color:#9fe8b7}a:focus-visible{outline-color:#9fe8b7}}</style><main><a href="../">Sustain — Privacy &amp; Legal</a><h1>${escape(title)}</h1>${preview ? '<p class="notice">Development draft. Not effective or approved for public release. Owner and launch details remain unresolved.</p>' : ""}<p>Version ${escape(config.version)} · ${config.effectiveDate ? "Effective " + escape(config.effectiveDate) : "Reviewed " + escape(config.reviewedAt) + "; not yet effective"}</p>${body}<nav aria-label="Legal pages">${nav}<a href="../licenses/">Third-party licenses</a></nav></main></html>`;
for (const p of policies) {
  fs.mkdirSync(path.join(out, p.slug), { recursive: true });
  fs.writeFileSync(
    path.join(out, p.slug, "index.html"),
    frame(
      p.title,
      p.sections
        .map(
          (s) =>
            `<section><h2>${escape(s.heading)}</h2>${s.paragraphs.map((t) => `<p>${escape(t)}</p>`).join("")}</section>`,
        )
        .join(""),
    ),
  );
}
fs.writeFileSync(
  path.join(out, "index.html"),
  frame(
    "Privacy & Legal",
    "<p>Read how Sustain handles information and find your controls.</p>",
  ).replaceAll('href="../', 'href="./'),
);
const notices = read("third-party-notices.json");
fs.mkdirSync(path.join(out, "licenses"), { recursive: true });
fs.writeFileSync(
  path.join(out, "licenses", "index.html"),
  frame(
    "Third-party licenses",
    notices
      .map(
        (n) =>
          `<details><summary>${escape(n.name)} ${escape(n.version)} — ${escape(n.license)}</summary><pre>${escape(n.text)}</pre></details>`,
      )
      .join(""),
  ),
);
console.log(
  `Prepared ${policies.length} policy pages and license notices in ${out}. Nothing published.`,
);
