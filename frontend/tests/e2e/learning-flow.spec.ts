import { expect, test } from "@playwright/test";

test("planner presents the four study inputs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("What are you studying?")).toBeVisible();
  await expect(page.getByLabel("Study Duration")).toBeVisible();
  await expect(page.getByLabel("Your Level")).toBeVisible();
  await expect(page.getByLabel("Learning Goal")).toBeVisible();
});
