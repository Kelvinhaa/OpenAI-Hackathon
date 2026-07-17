import { expect, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("authenticate the local Supabase test user", async ({ page }) => {
  if (!email || !password) {
    throw new Error("E2E_EMAIL and E2E_PASSWORD are required for browser tests.");
  }

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await page.waitForURL("/");
  await expect(page.getByLabel("What are you studying?")).toBeVisible();

  await page.context().storageState({ path: "playwright/.auth/user.json" });
});
