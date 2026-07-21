import { expect, test } from "@playwright/test";

test("guest planner previews a plan without offering a protected map", async ({ page }) => {
  await page.route("**/study/preview", async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ exam_date: "2026-08-01" });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        subject: "Cell division",
        time: 45,
        level: "intermediate",
        goal: null,
        exam_date: "2026-08-01",
        recommendation: {
          summary: "Build the cell-division sequence from memory before checking it.",
          techniques: [],
          tips: [],
        },
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("subject topic").fill("Cell division");
  await page.getByLabel("Study Duration").fill("45");
  await page.getByLabel("Your Level").click();
  await page.getByRole("option", { name: "Intermediate" }).click();
  await page.getByLabel("Exam date").fill("2026-08-01");
  const previewResponse = page.waitForResponse("**/study/preview");
  await page.getByRole("button", { name: "Generate study plan" }).click();
  await expect((await previewResponse).ok()).toBe(true);

  await expect(page.getByRole("heading", { name: "Your Study Plan" })).toBeVisible();
  await expect(page.getByText("Exam 2026-08-01")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open learning map" })).toHaveCount(0);
});
