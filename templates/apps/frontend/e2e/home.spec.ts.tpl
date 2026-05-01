import { expect, test } from "@playwright/test";

const projectName = "__PROJECT_NAME__";

test("loads the frontend shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
});
