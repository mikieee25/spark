import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("e2e-correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/files$/);
}

test("searches, previews, favorites, and records a recent item", async ({ page }) => {
  await signIn(page);
  const search = page.getByRole("searchbox", { name: "Search workspace" });
  await search.fill("search fixture");
  await search.press("Enter");
  const result = page.getByRole("button", { name: /Open search result search-fixture\.txt/i });
  await expect(result).toBeVisible({ timeout: 15_000 });
  await result.click();
  await expect(page.getByText("DOE SPARK search fixture")).toBeVisible();
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /Open favorite search-fixture\.txt/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Open recent item search-fixture\.txt/i })).toBeVisible();
});

test("supports mobile search controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.getByRole("searchbox", { name: "Search workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search workspace", exact: true })).toBeVisible();
});
