import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
test("backup exclusion applies before React startup to the installed Expo template and is idempotent", () => {
  const require = createRequire(import.meta.url);
  const { addBackupExclusion } =
    require("../../../plugins/with-private-backups.js") as {
      addBackupExclusion: (s: string) => string;
    };
  const template = execFileSync(
    "tar",
    [
      "-xOf",
      resolve("../../node_modules/expo/template.tgz"),
      "package/ios/HelloWorld/AppDelegate.swift",
    ],
    { encoding: "utf8" },
  );
  const result = addBackupExclusion(template);
  assert.ok(
    result.indexOf("isExcludedFromBackup = true") <
      result.indexOf("factory.startReactNative"),
  );
  assert.match(result, /documentDirectory, .applicationSupportDirectory/);
  assert.equal(addBackupExclusion(result), result);
  assert.throws(() => addBackupExclusion("changed template"));
});
