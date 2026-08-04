import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests.
 *
 * These exist because the unit suite and `test:live` cannot see the two things
 * that break most often in this app: the auth boundary enforced by middleware,
 * and whether a workflow a person builds in the browser actually runs. Both are
 * only observable through a real browser against a real server.
 *
 * `npm run test:e2e` boots the dev server itself, so there is nothing to start
 * by hand and CI needs no extra steps.
 */
export default defineConfig({
  testDir: "./e2e",

  // A failing e2e test is usually a real failure, but a flaky one is worse than
  // no test at all, so retry in CI and never locally, where a retry would hide
  // the flake from the person who just wrote it.
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,

  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],

  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Reuse a server that is already up so a developer running `npm run dev` is
  // not forced to stop it. CI always gets a clean one.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:3001/login",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
