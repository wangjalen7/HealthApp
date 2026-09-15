import assert from "node:assert/strict";
import test from "node:test";

import { exportTextFiles, formatBytes, rowsToCsv } from "./model";

test("CSV export preserves commas, quotes, newlines, and nested values", () => {
  const csv = rowsToCsv([
    {
      name: 'Protein, "large"',
      note: "line one\nline two",
      tags: ["food", "saved"],
      optional: null,
      formula: "=2+2",
    },
  ]);
  assert.match(csv, /^\uFEFFname,note,tags,optional,formula\r\n/);
  assert.match(csv, /"Protein, ""large"""/);
  assert.match(csv, /"line one\nline two"/);
  assert.match(csv, /"\[""food"",""saved""\]"/);
  assert.match(csv, /'=2\+2/);
});

test("portable export contains a manifest, full JSON, and one CSV per dataset", () => {
  const files = exportTextFiles({
    exportVersion: 1,
    exportedAt: "2026-09-12T12:00:00.000Z",
    datasets: { cardio_entries: [{ id: "run-1", duration_minutes: 30 }] },
  });
  assert.ok(files["README.txt"]);
  assert.match(files["manifest.json"], /"cardio_entries": 1/);
  assert.match(files["full-data.json"], /"duration_minutes": 30/);
  assert.match(files["csv/cardio_entries.csv"], /run-1,30/);
});

test("byte sizes use readable units", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.0 MB");
});
