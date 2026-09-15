/* global process */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const expoCli = require.resolve("expo/bin/cli");
const result = spawnSync(
  process.execPath,
  [expoCli, "start", ...process.argv.slice(2)],
  {
    env: {
      ...process.env,
      APP_VARIANT: "development",
      EXPO_PUBLIC_APP_SCHEME: "healthapp-dev",
    },
    stdio: "inherit",
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
