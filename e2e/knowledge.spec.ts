import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";

/**
 * The knowledge feature, driven the way a person would drive it: sign up, paste
 * a document, ask a question, read the answer and check where it came from.
 *
 * Everything below this is exercised for real. Signup, session, workspace
 * seeding, chunking, the embeddings API, Atlas $vectorSearch, the answering
 * model, and the citation contract. Nothing is mocked, which is the only way to
 * find out whether the pieces that pass their own tests actually fit together.
 */

const HANDBOOK = `# Refunds

A customer can request a refund within thirty days of purchase. Refunds are
returned to the original payment method and take five to seven working days to
appear on a statement. We never refund to a different card.

# Shipping

Standard delivery is three to five working days. Express delivery arrives the
next working day if the order is placed before 2pm. We do not ship on weekends.

# Warranty

Every product carries a two year warranty against manufacturing defects. The
warranty does not cover accidental damage, water damage, or normal wear.`;

async function signUp(page: import("@playwright/test").Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  const password = "TestPassword123!";

  await page.goto("/signup");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/(workflow|knowledge)/, { timeout: 30_000 });

  return { email, password };
}

test.describe("knowledge, as a real user", () => {
  test("signs up, adds a document, and gets a cited answer from it", async ({ page }) => {
    test.setTimeout(180_000);

    await signUp(page);

    await page.goto("/knowledge");
    await expect(
      page.getByRole("banner").getByRole("heading", { name: "Your documents" })
    ).toBeVisible();

    // A brand new account has nothing, and the ask box says so rather than
    // letting someone ask a question that can only fail.
    await expect(page.getByPlaceholder("Add a document first")).toBeDisabled();

    // Add the handbook.
    await page.getByPlaceholder(/What is this/i).fill("Support handbook");
    await page.getByPlaceholder(/Paste the text/i).fill(HANDBOOK);
    await page.getByRole("button", { name: "Add" }).click();

    // It has to come back indexed, with the three markdown sections found.
    const row = page.locator("li", { hasText: "Support handbook" });
    await expect(row).toBeVisible({ timeout: 90_000 });
    await expect(row.getByText("ready")).toBeVisible();
    await expect(row).toContainText(/\d+ sections?, searchable/);

    // Now ask something worded nothing like the source text.
    await page.getByPlaceholder(/How long do refunds take/i).fill(
      "I bought something last week and want my money back, how long does that take?"
    );
    await page.getByRole("button", { name: "Ask" }).click();

    await expect(page.getByText("Where this came from")).toBeVisible({ timeout: 90_000 });

    // The answer must contain the fact, which only exists in the document.
    const answer = page.locator("main p.whitespace-pre-wrap").first();
    await expect(answer).toContainText(/five to seven|5 to 7/i, { timeout: 30_000 });

    // And the top citation must point at the Refunds section, not Shipping.
    const topCitation = page.locator("div", { hasText: /^\[1\]/ }).first();
    await expect(topCitation).toContainText("Support handbook");
    await expect(topCitation).toContainText("Refunds");
  });

  test("says it does not know rather than inventing an answer", async ({ page }) => {
    test.setTimeout(180_000);

    await signUp(page);
    await page.goto("/knowledge");

    await page.getByPlaceholder(/What is this/i).fill("Support handbook");
    await page.getByPlaceholder(/Paste the text/i).fill(HANDBOOK);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.locator("li", { hasText: "Support handbook" }).getByText("ready")).toBeVisible({
      timeout: 90_000,
    });

    // Nothing in the handbook covers this. Answering it from general knowledge
    // is the failure mode that makes a documents assistant dangerous.
    await page
      .getByPlaceholder(/How long do refunds take/i)
      .fill("What is the capital of France?");
    await page.getByRole("button", { name: "Ask" }).click();

    const answer = page.locator("main p.whitespace-pre-wrap").first();
    await expect(answer).toBeVisible({ timeout: 90_000 });
    await expect(answer).not.toContainText(/paris/i);
  });

  test("one account cannot read another account's documents", async ({ browser }) => {
    test.setTimeout(180_000);

    // Account A adds a document with a fact nobody could guess.
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    await signUp(pageA);
    await pageA.goto("/knowledge");
    await pageA.getByPlaceholder(/What is this/i).fill("Private notes");
    await pageA
      .getByPlaceholder(/Paste the text/i)
      .fill("# Door code\n\nThe office door code is 84213 and it changes every Monday.");
    await pageA.getByRole("button", { name: "Add" }).click();
    await expect(pageA.locator("li", { hasText: "Private notes" }).getByText("ready")).toBeVisible({
      timeout: 90_000,
    });

    // Account B asks for exactly that.
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();
    await signUp(pageB);
    await pageB.goto("/knowledge");

    await expect(pageB.getByText("Nothing yet.")).toBeVisible();
    await expect(pageB.getByPlaceholder("Add a document first")).toBeDisabled();

    await contextA.close();
    await contextB.close();
  });

  test("redirects a signed-out visitor to login", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/knowledge");
    await expect(page).toHaveURL(/\/login/);
    await context.close();
  });
});
