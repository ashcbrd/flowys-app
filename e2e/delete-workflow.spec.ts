import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "crypto";

/**
 * The bug this exists for: deleting a workflow left its id in the address bar,
 * and the canvas came back on the next reload.
 *
 * The delete itself always worked. The row really was removed. Everything that
 * resurrected it lived in the browser, which is why no server-side test could
 * see it and only driving a real browser could.
 *
 * The sequence below is the one from the report, in order: start from a
 * template, save it so it has a real id, delete it, reload, wait, reload again.
 */

async function signUp(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto("/signup");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("TestPassword123!");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/workflow/, { timeout: 30_000 });
  return email;
}

/** Put a template on the canvas and save it, so it has an id in the URL. */
async function createSavedWorkflowFromTemplate(page: Page): Promise<string> {
  await page.getByRole("button", { name: /start from a template/i }).click();

  // The smallest template, so this test is about deleting rather than about
  // how long an eleven step workflow takes to lay out.
  await page.getByText("Turn a pile of reviews into a decision").click();

  // Steps landed on the canvas.
  await expect(page.locator(".react-flow__node").first()).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Save" }).click();

  // Saving assigns an id and the editor puts it in the URL.
  await page.waitForURL(/\/workflow\/[0-9a-f-]{36}/, { timeout: 30_000 });

  const id = page.url().split("/workflow/")[1];
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return id;
}

/**
 * Run it, because the reported sequence included a run and a run leaves
 * execution records pointing at the workflow. Deleting something that has been
 * used is the case that matters; deleting something untouched is the easy one.
 */
async function runWorkflow(page: Page) {
  await page.getByRole("button", { name: "Run", exact: true }).click();

  // "Upload your reviews" is a file picker, not a text box.
  // Scoped to the dialog: the header's Import Workflow control has its own
  // hidden file input, and it comes first in the DOM.
  await page.getByRole("dialog").locator('input[type="file"]').setInputFiles({
    name: "reviews.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      [
        "Great app but it crashes on checkout every time.",
        "Support never replied to my email after four days.",
        "Fast delivery, and the packaging was good.",
        "Crashed again at payment. Losing patience.",
      ].join("\n")
    ),
  });

  const about = page.getByRole("textbox", { name: /what's it about/i });
  if (await about.count()) await about.fill("the mobile app");

  await page.getByRole("button", { name: /run workflow/i }).click();

  // Eleven steps of real model calls. Wait for the run to stop, however it ends.
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeEnabled({
    timeout: 180_000,
  });
}

async function deleteWorkflow(page: Page, name: RegExp) {
  // After a run the execution drawer sits over the header and swallows the
  // click. Close it the way a person would, with its own X, rather than forcing
  // the click through: a forced click would also pass if the drawer were
  // genuinely trapping a user.
  //
  // Escape does not close it. The drawer is hand-rolled rather than a Radix
  // dialog, so it has no key handling at all.
  // The heading reads "Running" mid-run and "Execution" once it stops, so match
  // either. The X is a sibling of the heading's parent, not of the heading.
  const drawerHeading = page.getByRole("heading", { name: /^(Execution|Running)$/ });
  if (await drawerHeading.count()) {
    await drawerHeading.locator("../..").getByRole("button").last().click();
    await expect(drawerHeading).toBeHidden({ timeout: 10_000 });
  }

  // The overflow menu trigger carries no accessible name; it is the last
  // control in the header.
  await page.getByRole("banner").getByRole("button").last().click();
  // Dropdown entries render as buttons, not menuitems.
  await page.getByRole("button", { name: "Open Workflow" }).click();

  const row = page.locator("[role='dialog']").getByRole("heading", { name }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Delete Workflow" }).first().click();
  await page.getByRole("button", { name: /^delete$/i }).last().click();

  await expect(page.getByText(/deleted successfully/i)).toBeVisible({ timeout: 20_000 });
}

test.describe("deleting a workflow", () => {
  test("does not leave the id in the URL, and does not come back after a reload", async ({
    page,
  }) => {
    test.setTimeout(420_000);

    await signUp(page);
    const workflowId = await createSavedWorkflowFromTemplate(page);
    await runWorkflow(page);

    await deleteWorkflow(page, /Untitled Workflow/i);

    // 1. The address bar must not still point at the deleted workflow.
    //    This is the exact thing in the bug report screenshot.
    await expect(page).not.toHaveURL(new RegExp(workflowId), { timeout: 15_000 });
    await expect(page).toHaveURL(/\/workflow\/?$/);

    // 2. The canvas is empty.
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    // 3. Reload. This is where it used to come back.
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(new RegExp(workflowId));
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    // 4. Wait, then reload again. Hydration and the URL load used to race, so a
    //    single reload could pass by luck while the second one failed.
    await page.waitForTimeout(5_000);
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(page).not.toHaveURL(new RegExp(workflowId));
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    // 5. And it is gone from the list, not merely off the canvas.
    await page.getByRole("banner").getByRole("button").last().click();
    await page.getByRole("button", { name: "Open Workflow" }).click();
    await expect(page.locator("[role='dialog']").getByText("0 total")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("visiting a deleted workflow's URL directly does not restore it", async ({ page }) => {
    test.setTimeout(420_000);

    await signUp(page);
    const workflowId = await createSavedWorkflowFromTemplate(page);
    await deleteWorkflow(page, /Untitled Workflow/i);

    // Someone with the old link in their history, or a stale tab.
    await page.goto(`/workflow/${workflowId}`);
    await page.waitForLoadState("networkidle");

    // It should bounce to a clean canvas rather than paint a dead workflow.
    await expect(page).toHaveURL(/\/workflow\/?$/, { timeout: 20_000 });
    await expect(page.locator(".react-flow__node")).toHaveCount(0);

    await page.waitForTimeout(5_000);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".react-flow__node")).toHaveCount(0);
  });
});
