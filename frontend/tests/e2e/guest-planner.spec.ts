import { expect, test } from "@playwright/test";

test("guest planner previews a plan without offering a protected map", async ({ page }) => {
  await page.route("**/study/preview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        subject: "Cell division",
        time: 45,
        level: "intermediate",
        goal: null,
        recommendation: {
          summary: "Build the cell-division sequence from memory before checking it.",
          techniques: [],
          tips: [],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("What are you studying?").fill("Cell division");
  await page.getByLabel("Study Duration").fill("45");
  await page.getByLabel("Your Level").click();
  await page.getByRole("option", { name: "Intermediate" }).click();
  const previewResponse = page.waitForResponse("**/study/preview");
  await page.getByRole("button", { name: "Generate study plan" }).click();
  await expect((await previewResponse).ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "Your Study Plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open learning map" })).toHaveCount(0);
});
