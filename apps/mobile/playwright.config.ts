import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: "dist/e2e-results",
  webServer: {
    command: "npx expo start --web --port 8082 --max-workers 2",
    url: "http://localhost:8082",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      CI: "1",
      EXPO_PUBLIC_SUPABASE_URL: "https://review.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "isolated-test-placeholder",
    },
  },
  use: {
    actionTimeout: 10_000,
    baseURL: "http://localhost:8082",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      channel:
        process.env.E2E_BROWSER_CHANNEL ||
        (process.platform === "win32" ? "msedge" : undefined),
    },
    screenshot: "only-on-failure",
    trace: "off",
  },
});
