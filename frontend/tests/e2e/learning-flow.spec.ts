import { expect, test } from "@playwright/test";

test("planner presents the four study inputs", async ({ page }) => {
  await page.goto("/");
  const subjectExamples = page.getByLabel("Study subject examples");
  await expect(subjectExamples).toBeVisible();
  const username = (await page.locator(".topnav-user .topnav-email").textContent())?.trim();
  expect(username).toBeTruthy();
  await expect(subjectExamples).toContainText(`What are you studying today, ${username}?`);
  await expect(subjectExamples).toContainText("biology");
  await expect(subjectExamples).toContainText("calculus", { timeout: 3500 });
  await expect(page.getByLabel("subject topic")).toBeVisible();
  await expect(page.getByLabel("Study Duration")).toBeVisible();
  await expect(page.getByLabel("Your Level")).toBeVisible();
  await expect(page.getByLabel("Learning Goal")).toBeVisible();
});

test("authenticated planner uploads a PDF with learner inputs", async ({ page }) => {
  await page.route("**/study/from-pdf", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
    const body = route.request().postDataBuffer()?.toString() ?? "";
    expect(body).toContain('name="subject"');
    expect(body).toContain("Cell division");
    expect(body).toContain('filename="notes.pdf"');

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 42,
        subject: "Cell division",
        time: 45,
        level: "intermediate",
        goal: "Prepare for a quiz",
        exam_date: null,
        recommendation: { summary: "Plan", techniques: [], tips: [] },
        created_at: null,
        last_reviewed_at: null,
        next_review_at: null,
        review_count: 0,
        interval_days: 1,
        stability: 0,
        concept_count: 0,
        due_concept_count: 0,
        concepts: [],
        edges: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("subject topic").fill("Cell division");
  await page.getByLabel("lecture notes / PDFs").setInputFiles({
    name: "notes.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\\nnotes"),
  });
  await page.getByLabel("Study Duration").fill("45");
  await page.getByLabel("Your Level").click();
  await page.getByRole("option", { name: "Intermediate" }).click();
  await page.getByLabel("Learning Goal").fill("Prepare for a quiz");
  await page.getByRole("button", { name: "Generate study plan" }).click();

  await expect(page.getByRole("link", { name: "Open learning map" })).toHaveAttribute(
    "href",
    "/map/42",
  );
});

test("planner rotates subject examples when reduced motion is enabled", async ({ page }) => {
  const motionWarnings: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Reduced Motion enabled")) motionWarnings.push(message.text());
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const subjectExamples = page.getByLabel("Study subject examples");
  await expect(subjectExamples).toContainText("biology");
  await expect(subjectExamples).toContainText("calculus", { timeout: 3500 });
  await expect(motionWarnings).toEqual([]);
});

test("mobile navigation opens an accessible compact menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menuButton = page.locator(".topnav-mobile-toggle");
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("link", { name: "Planner", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Library", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review", exact: true })).toBeVisible();
  await expect(menu.getByText("Plan map", { exact: true })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Escape");
  await expect(menu).not.toBeVisible();
  await expect(menuButton).toHaveAttribute("aria-expanded", "false");
});

test("planner navigation opens the most recently saved map", async ({ page }) => {
  await page.route("**/study", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        { id: 4, created_at: "2026-07-17T10:00:00Z" },
        { id: 9, created_at: "2026-07-18T10:00:00Z" },
      ]),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("link", { name: "Plan map" })).toHaveAttribute("href", "/map/9");
  await expect(page.locator(".topnav-user .topnav-email")).not.toHaveText("");
  await expect(page.locator(".topnav-avatar")).not.toHaveText("");
  await expect(page.locator(".topnav-tab").filter({ hasText: "Planner" })).toHaveCSS("text-transform", "lowercase");
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCSS("text-transform", "lowercase");
  await expect(page.locator(".topnav-avatar")).toHaveCSS("background-color", "rgb(238, 231, 217)");
  await expect(page.locator(".topnav-avatar")).toHaveCSS("color", "rgb(43, 57, 51)");

  for (const [label, icon] of [
    ["Planner", "planner"],
    ["Library", "library"],
    ["Review", "review"],
    ["Plan map", "planning-map"],
  ]) {
    await expect(
      page.locator(".topnav-tab").filter({ hasText: label }).locator(`[data-nav-icon="${icon}"]`),
    ).toBeVisible();
  }
});

test("authenticated planner hands a generated plan off to its learning map", async ({ page }) => {
  await page.route("**/study", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
      return;
    }

    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        subject: "Cell division",
        time: 45,
        level: "intermediate",
        goal: "Prepare for a quiz",
        recommendation: {
          summary: "Build the cell-division sequence from memory before checking it.",
          techniques: [{
            title: "Active Recall",
            description: "Sketch each division stage without notes.",
            duration_minutes: 45,
          }],
          tips: ["Name the purpose of every phase."],
        },
        concepts: [],
        edges: [],
      }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const username = (await page.locator(".topnav-user .topnav-email").textContent())?.trim();
  expect(username).toBeTruthy();
  await expect(page.getByLabel("Study subject examples")).toContainText(
    `What are you studying today, ${username}?`,
  );
  await page.getByLabel("subject topic").fill("Cell division");
  await page.getByLabel("Study Duration").fill("45");
  await page.getByLabel("Your Level").click();
  await page.getByRole("option", { name: "Intermediate" }).click();
  await page.getByLabel("Learning Goal").fill("Prepare for a quiz");
  await page.getByRole("button", { name: "Generate study plan" }).click();

  await expect(page.getByRole("heading", { name: "Your Study Plan" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open learning map" })).toHaveAttribute(
    "href",
    "/map/1",
  );
});

test("library removes an owned map", async ({ page }) => {
  const study = {
    id: 7,
    subject: "Cell division",
    time: 45,
    level: "intermediate",
    goal: "Prepare for a quiz",
    exam_date: null,
    recommendation: { summary: "Plan", techniques: [], tips: [] },
    created_at: "2026-07-21T10:00:00Z",
    last_reviewed_at: null,
    next_review_at: null,
    review_count: 0,
    interval_days: 1,
    stability: 0,
    concept_count: 0,
    due_concept_count: 0,
    concepts: [],
    edges: [],
  };

  await page.route("**/study", async (route) => {
    expect(route.request().method()).toBe("GET");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([study]) });
  });
  await page.route("**/study/7", async (route) => {
    expect(route.request().method()).toBe("DELETE");
    await route.fulfill({ status: 204 });
  });

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Cell division" })).toBeVisible();
  await page.getByRole("button", { name: "remove Cell division" }).click();
  await expect(page.getByText("remove this map?")).toBeVisible();
  await page.getByRole("button", { name: "remove permanently" }).click();
  await expect(page.getByRole("heading", { name: "Cell division" })).not.toBeVisible();
});

test("student receives feedback then confirms a rating", async ({ page }) => {
  const study = {
    id: 1,
    user_id: "student-1",
    subject: "Cell division",
    time: 45,
    level: "intermediate",
    goal: "Prepare for a quiz",
    exam_date: "2026-08-01",
    recommendation: {
      summary: "Build the cell-division sequence from memory before checking it.",
      techniques: [],
      tips: [],
    },
    review_count: 0,
    interval_days: 1,
    stability: 0,
    concepts: [
      {
        id: 1,
        key: "mitosis",
        title: "Mitosis",
        explanation: "A parent cell divides to make two genetically identical daughter cells.",
        retrieval_prompt: "Explain what mitosis produces and why it matters.",
        last_reviewed_at: null,
        next_review_at: null,
        review_count: 0,
        interval_days: 1,
        stability: 0,
        difficulty: 5,
        last_rating: null,
      },
      {
        id: 2,
        key: "cell-cycle",
        title: "Cell cycle",
        explanation: "The cell cycle prepares a cell to divide.",
        retrieval_prompt: "What happens before mitosis?",
        last_reviewed_at: null,
        next_review_at: null,
        review_count: 0,
        interval_days: 1,
        stability: 0,
        difficulty: 5,
        last_rating: null,
      },
    ],
    edges: [{ id: 1, prerequisite_node_id: 2, dependent_node_id: 1 }],
  };

  await page.route("**/study/1", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(study) });
  });
  await page.route("**/study/concepts/1/feedback", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    expect(route.request().postDataJSON()).toEqual({ answer: "It creates two identical cells." });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        feedback: "Correct: mitosis creates two genetically identical daughter cells.",
        suggested_rating: 3,
        prerequisite_concept_id: 2,
      }),
    });
  });
  await page.route("**/study/concepts/1/review", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    expect(route.request().postDataJSON()).toEqual({
      answer: "It creates two identical cells.",
      rating: 3,
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        last_reviewed_at: "2026-07-18T10:00:00Z",
        next_review_at: "2026-07-21T10:00:00Z",
        review_count: 1,
        interval_days: 3,
        stability: 3,
        difficulty: 4.7,
        last_rating: 3,
      }),
    });
  });

  await page.goto("/map/1");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByText("Exam-ready path")).toBeVisible();
  await expect(page.getByText("Cell cycle").last()).toBeVisible();
  await page.getByRole("button", { name: "Mitosis" }).click();
  await page.getByLabel("Your explanation").fill("It creates two identical cells.");
  await page.getByRole("button", { name: "Check recall" }).click();
  await expect(page.getByText("Suggested rating")).toBeVisible();
  await expect(page.getByRole("button", { name: "Good" })).not.toHaveClass(/recall-rating--3/);
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByText(/Next review/)).toBeVisible();
  await expect(page.getByText("Growing", { exact: true })).toBeVisible();
  await expect(page.getByText("1 review", { exact: true })).toBeVisible();
});

test("library opens a saved map and review shows due concepts", async ({ page }) => {
  const study = {
    id: 1,
    user_id: "student-1",
    subject: "Cell division",
    time: 45,
    level: "intermediate",
    goal: "Prepare for a quiz",
    recommendation: { summary: "Build the cell-division sequence from memory.", techniques: [], tips: [] },
    review_count: 0,
    interval_days: 1,
    stability: 0,
    concept_count: 2,
    due_concept_count: 2,
    concepts: [{
      id: 1,
      key: "mitosis",
      title: "Mitosis",
      explanation: "A parent cell divides to make two genetically identical daughter cells.",
      retrieval_prompt: "Why does mitosis create identical cells?",
      last_reviewed_at: null,
      next_review_at: "2026-07-18T10:00:00Z",
      review_count: 0,
      interval_days: 1,
      stability: 0,
      difficulty: 5,
      last_rating: null,
    }, {
      id: 2,
      key: "cytokinesis",
      title: "Cytokinesis",
      explanation: "The cell divides its cytoplasm after mitosis.",
      retrieval_prompt: "What completes cell division after mitosis?",
      last_reviewed_at: null,
      next_review_at: "2026-07-18T10:00:00Z",
      review_count: 0,
      interval_days: 1,
      stability: 0,
      difficulty: 5,
      last_rating: null,
    }],
    edges: [],
  };
  const dueConcepts = study.concepts.map((concept) => ({ ...concept, subject: study.subject }));

  await page.route("**/study", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([study]) });
  });
  await page.route("**/study/review-queue", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(dueConcepts) });
  });
  await page.route("**/study/1", async (route) => {
    expect(route.request().method()).toBe("GET");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(study) });
  });
  await page.route("**/study/concepts/1/feedback", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    expect(route.request().postDataJSON()).toEqual({ answer: "It creates two identical cells." });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        feedback: "Correct: mitosis produces genetically identical daughter cells.",
        suggested_rating: 3,
        prerequisite_concept_id: null,
      }),
    });
  });
  await page.route("**/study/concepts/1/review", async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().headers().authorization).toMatch(/^Bearer\s.+/);
    expect(route.request().postDataJSON()).toEqual({ answer: "It creates two identical cells.", rating: 3 });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        last_reviewed_at: "2026-07-18T10:00:00Z",
        next_review_at: "2026-07-21T10:00:00Z",
        review_count: 1,
        interval_days: 3,
        stability: 3,
        difficulty: 4.7,
        last_rating: 3,
      }),
    });
  });

  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  const savedMap = page.locator(".library-map-card");
  await expect(savedMap).toHaveCount(1);
  await expect(await savedMap.evaluate((element) => getComputedStyle(element, "::after").content)).toBe("none");
  await page.getByRole("link", { name: "open plan map" }).click();
  await expect(page).toHaveURL(/\/map\/1$/);
  await expect(page.getByRole("link", { name: "Plan map" })).toBeVisible();

  await page.goto("/review");
  await expect(page.getByRole("heading", { name: "Due for review" })).toBeVisible();
  await expect(page.getByText("Why does mitosis create identical cells?")).toBeVisible();
  await page.getByLabel("Your explanation").fill("It creates two identical cells.");
  await page.getByRole("button", { name: "Check recall" }).click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(page.getByText("Review recorded")).toBeVisible();
  await expect(page.getByText("Why does mitosis create identical cells?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next due concept" })).toBeVisible();
  await expect(page.getByText("1 concept remains")).toBeVisible();
  await page.getByRole("button", { name: "Next due concept" }).click();
  await expect(page.getByRole("heading", { name: "Cytokinesis" })).toBeVisible();
  await expect(page.getByText("What completes cell division after mitosis?")).toBeVisible();
});

test("review keeps upcoming and unscheduled concepts accessible", async ({ page }) => {
  const study = {
    id: 1,
    user_id: "student-1",
    subject: "Cell division",
    time: 45,
    level: "intermediate",
    goal: "Prepare for a quiz",
    recommendation: { summary: "Build the sequence from memory.", techniques: [], tips: [] },
    review_count: 1,
    interval_days: 3,
    stability: 3,
    concept_count: 2,
    due_concept_count: 0,
    concepts: [
      {
        id: 1,
        key: "mitosis",
        title: "Mitosis",
        explanation: "Nuclear division creates matching nuclei.",
        retrieval_prompt: "What does mitosis produce?",
        last_reviewed_at: "2026-07-18T10:00:00Z",
        next_review_at: "2099-07-23T10:00:00Z",
        review_count: 1,
        interval_days: 3,
        stability: 3,
        difficulty: 4.7,
        last_rating: 3,
      },
      {
        id: 2,
        key: "cell-cycle",
        title: "Cell cycle",
        explanation: "The cell cycle prepares a cell to divide.",
        retrieval_prompt: "What happens before mitosis?",
        last_reviewed_at: null,
        next_review_at: null,
        review_count: 0,
        interval_days: 1,
        stability: 0,
        difficulty: 5,
        last_rating: null,
      },
    ],
    edges: [],
  };

  await page.route("**/study", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([study]) });
  });
  await page.route("**/study/review-queue", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto("/review");

  await expect(page.getByRole("heading", { name: "Upcoming review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Mitosis early" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start first recall" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Cell cycle" })).toBeVisible();

  await page.getByRole("button", { name: "Review Mitosis early" }).click();
  await expect(page.getByText("What does mitosis produce?")).toBeVisible();
});
