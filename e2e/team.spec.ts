import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";

/**
 * Teams, driven the way a person would: create a shared workspace, add a
 * colleague who already has an account, change their role, remove them.
 *
 * The rules worth proving here are the ones with no recovery path if they are
 * wrong. A workspace that loses its last owner cannot be administered by
 * anyone, and a personal workspace that quietly accepts members would share
 * the place someone's private documents live.
 */

async function signUp(page: Page): Promise<string> {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto("/signup");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("TestPassword123!");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/workflow/, { timeout: 30_000 });
  return email;
}

test.describe("teams", () => {
  test("a personal workspace stays a workspace of one", async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto("/settings/team");

    await expect(page.getByRole("button", { name: /Personal/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/stays a workspace of one/i)).toBeVisible();
    // No way to add anyone to it.
    await expect(page.getByPlaceholder("Their email address")).toHaveCount(0);
  });

  test("creates a shared workspace, adds a colleague, changes and removes them", async ({
    browser,
  }) => {
    test.setTimeout(180_000);

    // A colleague has to exist before they can be added; the product says so
    // rather than creating a row nobody can redeem.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    const colleagueEmail = await signUp(otherPage);
    await other.close();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await signUp(page);
    await page.goto("/settings/team");

    await page.getByPlaceholder(/New shared workspace/i).fill("Support team");
    await page.getByRole("button", { name: /create workspace/i }).click();

    await expect(page.getByRole("button", { name: /Support team/ })).toBeVisible({
      timeout: 20_000,
    });

    // The creator is its owner, and owners cannot be edited away in the UI.
    await expect(page.getByText("owner").first()).toBeVisible();

    // Add the colleague.
    await page.getByPlaceholder("Their email address").fill(colleagueEmail);
    await page.getByRole("button", { name: "Add" }).click();

    const row = page.locator("li", { hasText: colleagueEmail });
    await expect(row).toBeVisible({ timeout: 20_000 });

    // Promote them.
    await row.locator("select").selectOption("admin");
    await expect(row.locator("select")).toHaveValue("admin", { timeout: 20_000 });

    // Remove them.
    await row.getByRole("button", { name: "Remove from workspace" }).click();
    await expect(page.locator("li", { hasText: colleagueEmail })).toHaveCount(0, {
      timeout: 20_000,
    });

    await ctx.close();
  });

  test("says plainly when the person has no account yet", async ({ page }) => {
    test.setTimeout(120_000);
    await signUp(page);
    await page.goto("/settings/team");

    await page.getByPlaceholder(/New shared workspace/i).fill("Ops");
    await page.getByRole("button", { name: /create workspace/i }).click();
    await expect(page.getByRole("button", { name: /Ops/ })).toBeVisible({ timeout: 20_000 });

    await page.getByPlaceholder("Their email address").fill("nobody-here@example.com");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText(/has a Flowys account yet/i)).toBeVisible({ timeout: 20_000 });
  });

  test("refuses to strand a workspace by removing its last owner", async ({ page, request }) => {
    test.setTimeout(120_000);
    await signUp(page);

    // Create through the API so the assertion is about the rule, not the form.
    const created = await page.evaluate(async () => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Solo" }),
      });
      return res.json();
    });

    const result = await page.evaluate(async (workspaceId: string) => {
      const me = await (await fetch("/api/auth/session")).json();
      const res = await fetch(
        `/api/workspaces/${workspaceId}/members?userId=${encodeURIComponent(me.user.id)}`,
        { method: "DELETE" }
      );
      return { status: res.status, body: await res.json().catch(() => null) };
    }, created.id);

    expect(result.status).toBe(409);
    expect(result.body.error).toMatch(/last owner/i);
    void request;
  });
});
