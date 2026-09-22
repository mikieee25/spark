import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("e2e-correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/files$/);
}

test("administrator can upload, download, recycle, restore, and purge a file", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("File upload").setInputFiles({ name: "e2e-note.txt", mimeType: "text/plain", buffer: Buffer.from("DOE SPARK") });
  await expect(page.getByRole("button", { name: "e2e-note.txt", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "e2e-note.txt", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  await expect((await download).suggestedFilename()).toBe("e2e-note.txt");

  await page.getByRole("button", { name: "Move to Recycle bin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Recycle bin" }).click();
  await expect(page.getByRole("button", { name: "e2e-note.txt", exact: true })).not.toBeVisible();

  await page.getByRole("link", { name: "Recycle bin" }).click();
  await expect(page.getByText("e2e-note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("e2e-note.txt restored.")).toBeVisible();

  await page.goto("/files");
  await page.getByRole("button", { name: "e2e-note.txt", exact: true }).click();
  await page.getByRole("button", { name: "Move to Recycle bin" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Move to Recycle bin" }).click();
  await page.getByRole("link", { name: "Recycle bin" }).click();
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Permanently delete" }).click();
  await expect(page.getByText("e2e-note.txt", { exact: true })).not.toBeVisible();
});
