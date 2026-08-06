import { test, expect } from "@playwright/test";

/**
 * The auth boundary.
 *
 * proxy.ts is the only thing standing between an anonymous visitor and
 * every workspace in the database. It is also the easiest file in the codebase
 * to break silently: adding a route and forgetting to list it in
 * `protectedRoutes` produces no error, no failing unit test and no visible
 * symptom. It just quietly serves the page.
 *
 * These tests fail the moment that happens.
 */

// Kept deliberately in sync with `protectedRoutes` in proxy.ts. If you add
// a route there, add it here. The pair is the point.
const PROTECTED_ROUTES = [
  "/workflow",
  "/integrations",
  "/settings",
  "/apps",
];

// Nested paths matter separately: middleware matches with startsWith, so a bug
// in the matcher can gate the parent and leak the child.
const PROTECTED_NESTED_ROUTES = [
  "/workflow/some-workflow-id",
  "/apps/some-app-id",
  "/preview/some-listing-id",
  "/settings/account",
];

test.describe("anonymous visitors", () => {
  for (const route of [...PROTECTED_ROUTES, ...PROTECTED_NESTED_ROUTES]) {
    test(`${route} is not served to a logged-out visitor`, async ({ page }) => {
      await page.goto(route);

      // The assertion is on the final URL rather than on page content, because
      // a redirect that lands somewhere unexpected is just as broken as no
      // redirect at all.
      await expect(page).toHaveURL(/\/login(\?|$)/);
    });

    test(`${route} is preserved as callbackUrl`, async ({ page }) => {
      await page.goto(route);

      // Losing the callbackUrl is not a security bug, it is a usability one:
      // the visitor logs in and lands somewhere they did not ask for. It breaks
      // often enough to be worth asserting.
      const callbackUrl = new URL(page.url()).searchParams.get("callbackUrl");
      expect(callbackUrl).toBe(route);
    });
  }
});

test.describe("public routes", () => {
  for (const route of ["/login", "/signup"]) {
    test(`${route} is reachable while logged out`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response?.status()).toBe(200);
      await expect(page).toHaveURL(new RegExp(`${route}$`));
    });
  }

  test("the login page renders a usable form", async ({ page }) => {
    await page.goto("/login");

    // If these three are not present and enabled, nobody can get into the
    // product at all. It is the single highest-consequence screen in the app
    // and the one least likely to have a unit test.
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeEnabled();
  });
});
