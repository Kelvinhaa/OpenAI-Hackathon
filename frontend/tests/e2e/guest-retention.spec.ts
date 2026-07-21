import { expect, test } from "@playwright/test";

test.describe("guest retention preview", () => {
  test.describe.configure({ mode: "serial" });

  test("registration sends username as Auth metadata", async ({ page }) => {
    await page.route("**/auth/v1/signup*", async (route) => {
      expect(route.request().postDataJSON()).toMatchObject({
        email: "ada@example.com",
        password: "Password1",
        data: { username: "Ada Lovelace" },
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "user-1", email: "ada@example.com" },
          session: null,
        }),
      });
    });

    await page.goto("/register");
    await page.getByLabel("Username").fill("  Ada Lovelace  ");
    await page.getByLabel("Email").fill("ada@example.com");
    await page.getByLabel("Password").fill("Password1");
    await page.getByRole("button", { name: "Create Account" }).click();
  });

  test("guest header keeps sign-in and sign-up actions available", async ({ page }) => {
    await page.goto("/");

    const signIn = page.getByRole("link", { name: "Sign in" });
    await expect(signIn).toHaveAttribute("href", "/login");
    await expect(signIn).toHaveCSS("font-family", /Newsreader/);
    await expect(signIn).toHaveCSS("text-transform", "lowercase");
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();

    await page.goto("/");
    await page.getByRole("link", { name: "Sign up" }).click();
    await expect(page).toHaveURL(/\/register$/);
    await expect(page.getByRole("heading", { name: "Create Account" })).toBeVisible();
  });

  test("guest planner uses the generic study prompt", async ({ page }) => {
    await page.goto("/");

    const subjectExamples = page.getByLabel("Study subject examples");
    await expect(subjectExamples).toContainText("What are you studying today?");
    await expect(subjectExamples).not.toContainText("What are you studying today,");
    await expect(subjectExamples).toContainText("calculus", { timeout: 3500 });
  });

  test("guest planner keeps PDF plan maps behind sign-in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByLabel("lecture notes / PDFs")).not.toBeVisible();
    await expect(page.getByText("sign in to create a PDF-based plan map")).toBeVisible();
  });

  test("guest dashboard presents the illustrative retention trend", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("How memory fades", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Retention level" })).toBeVisible();
    await expect(page.locator(".retention-metric-value")).toHaveText("86%");
    await expect(page.getByText("With timely review, recall becomes more stable over time.")).toBeVisible();
    await expect(page.getByText("Illustrative learning trend — not a personal prediction.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Illustrative retention trend after timely reviews" })).toBeVisible();
    await expect(page.locator(".retention-bar")).toHaveCount(5);
    await expect(page.locator(".retention-bars")).toHaveCSS("height", "84px");
    await expect(page.locator(".retention-bar-fill").first()).toHaveCSS("max-width", "104px");

    for (const label of ["Day 1", "Day 3", "Week 1", "Week 2", "Month 1"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("guest dashboard renders the finished retention trend with reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Retention level" })).toBeVisible();
    await expect(page.locator(".retention-metric-value")).toHaveText("86%");
    await expect(page.locator(".retention-bar")).toHaveCount(5);
    await expect(page.locator(".retention-trend")).toHaveCSS("animation-name", "none");
    await expect(page.locator(".retention-bar-fill").first()).toHaveCSS("animation-name", "none");
    await expect(page.locator(".demo-stat").first()).toHaveCSS("animation-name", "none");
    await expect(page.locator(".demo-session").first()).toHaveCSS("animation-name", "none");
    await expect(page.locator(".demo-stability-fill").first()).toHaveCSS("animation-name", "none");
  });

  test("guest dashboard stages supporting preview content with the retention trend", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator(".demo-stat").first()).not.toHaveCSS("animation-name", "none");
    await expect(page.locator(".demo-session").first()).not.toHaveCSS("animation-name", "none");
    await expect(page.locator(".demo-stability-fill").first()).not.toHaveCSS("animation-name", "none");
  });
});
