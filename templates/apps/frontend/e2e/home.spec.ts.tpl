import { expect, test } from "@playwright/test";

test("loads the frontend shell", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "__PROJECT_NAME__" })).toBeVisible();
});
