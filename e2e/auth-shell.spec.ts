import { expect, test } from "@playwright/test";

test("administrator authentication protects the SPARK shell", async ({ page }) => {
  await page.goto("/files");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("The username or password is incorrect.")).toBeVisible();

  await page.getByLabel("Password").fill("e2e-correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.getByRole("link", { name: "Administration" })).toBeVisible();
  await expect(page.getByRole("main", { name: "Content" })).toContainText("Shared files");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/files");
  await expect(page).toHaveURL(/\/login$/);
});
