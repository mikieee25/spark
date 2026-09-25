import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username").fill("e2e-admin");
  await page.getByLabel("Password").fill("e2e-correct-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/files$/);
}

test("administrator can upload, download, recycle, restore, and purge a file", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByLabel("File upload")
    .setInputFiles({
      name: "e2e-note.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("DOE SPARK"),
    });
  await expect(
    page.getByRole("button", { name: "e2e-note.txt", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "e2e-note.txt", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download", exact: true }).click();
  await expect((await download).suggestedFilename()).toBe("e2e-note.txt");

  await page.getByRole("button", { name: "Move to Recycle bin" }).click();
  await page
    .getByRole("dialog", { name: "Move to Recycle bin?" })
    .getByRole("button", { name: "Move to Recycle bin" })
    .click();
  await expect(
    page.getByRole("button", { name: "e2e-note.txt", exact: true })
  ).not.toBeVisible();

  await page.getByRole("link", { name: "Recycle bin" }).click();
  await expect(page.getByText("e2e-note.txt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("e2e-note.txt restored.")).toBeVisible();

  await page.goto("/files");
  await page.getByRole("button", { name: "e2e-note.txt", exact: true }).click();
  await page.getByRole("button", { name: "Move to Recycle bin" }).click();
  await page
    .getByRole("dialog", { name: "Move to Recycle bin?" })
    .getByRole("button", { name: "Move to Recycle bin" })
    .click();
  await page.getByRole("link", { name: "Recycle bin" }).click();
  await page.getByRole("button", { name: "Permanently delete" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Permanently delete" })
    .click();
  await expect(
    page.getByText("e2e-note.txt", { exact: true })
  ).not.toBeVisible();
});

test("single click opens details and double click opens the folder", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByLabel("Content")).toHaveCSS("overflow", "hidden");
  const workspace = page.locator("[data-file-workspace]");
  const main = page.getByLabel("Content");
  expect(
    await workspace.evaluate((element) => element.getBoundingClientRect().width)
  ).toBeGreaterThan(
    (await main.evaluate((element) => element.getBoundingClientRect().width)) *
      0.8
  );
  await expect(
    page.getByRole("region", { name: "File list scroll area" })
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight <= window.innerHeight
    )
  ).toBe(true);
  await page.getByRole("button", { name: "New folder" }).click();
  await page
    .getByRole("textbox", { name: "Folder name" })
    .fill("Double click folder");
  await page.getByRole("button", { name: "Create folder" }).click();

  const folder = page.getByRole("button", {
    name: "Double click folder",
    exact: true,
  });
  await folder.click();
  const details = page.getByRole("dialog", { name: "Selected item details" });
  await expect(details).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Preview of Double click folder" })
  ).toBeVisible();
  expect(
    await details.evaluate((element) => element.getBoundingClientRect().width)
  ).toBeGreaterThan(400);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();

  await folder.dblclick();
  await expect(
    page.getByRole("link", { name: "Double click folder", exact: true })
  ).toBeVisible();
});

test("workspace drag-and-drop uploads and batch actions can be undone", async ({
  page,
}) => {
  await signIn(page);
  await page.locator("[data-file-workspace]").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(["DOE SPARK"], "dropped-qol.txt", { type: "text/plain" })
    );
    element.dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: transfer,
      })
    );
  });
  const file = page.getByRole("button", {
    name: "dropped-qol.txt",
    exact: true,
  });
  await expect(file).toBeVisible();

  await page.getByRole("checkbox", { name: "Select dropped-qol.txt" }).check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download selected" }).click();
  await expect((await download).suggestedFilename()).toBe(
    "spark-selected-files.zip"
  );

  await page
    .getByRole("button", { name: "Move selected to Recycle bin" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move 1 items to Recycle bin" })
    .click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(file).toBeVisible();
});

test("workspace preferences persist and breadcrumbs navigate to parent folders", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("combobox", { name: "View mode" })
    .selectOption("large-icons");
  await page
    .getByRole("combobox", { name: "Sort by" })
    .selectOption("modified");
  await page.getByRole("button", { name: "Sort ascending" }).click();
  await page
    .getByRole("combobox", { name: "Workspace files rows per page" })
    .selectOption("25");
  await page
    .getByRole("combobox", { name: "Auto-refresh interval" })
    .selectOption("0");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "View mode" })).toHaveValue(
    "large-icons"
  );
  await expect(page.getByRole("combobox", { name: "Sort by" })).toHaveValue(
    "modified"
  );
  await expect(
    page.getByRole("button", { name: "Sort descending" })
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Workspace files rows per page" })
  ).toHaveValue("25");
  await expect(
    page.getByRole("combobox", { name: "Auto-refresh interval" })
  ).toHaveValue("0");

  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("QOL Parent");
  await page.getByRole("button", { name: "Create folder" }).click();
  await page
    .getByRole("button", { name: "QOL Parent", exact: true })
    .dblclick();
  await page.getByRole("button", { name: "New folder" }).click();
  await page.getByRole("textbox", { name: "Folder name" }).fill("QOL Child");
  await page.getByRole("button", { name: "Create folder" }).click();
  await page.getByRole("button", { name: "QOL Parent" }).click();
  await expect(
    page.getByRole("button", { name: "QOL Child", exact: true })
  ).toBeVisible();
});
