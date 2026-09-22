import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login"); await page.getByLabel("Username").fill("e2e-admin"); await page.getByLabel("Password").fill("e2e-correct-password"); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/\/files$/);
}

test("terminal stays disabled and admin controls remain reachable on mobile", async ({ page }) => {
  await signIn(page);
  const response = await page.request.post("/api/admin/terminal/token", { headers: { Origin: "http://127.0.0.1:3199" }, data: { ttlSeconds: 60 } });
  expect(response.status()).toBe(409); await expect(response.json()).resolves.toEqual({ error: "TERMINAL_DISABLED" });
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/admin"); await expect(page.getByRole("heading", { name: "SPARK control room" })).toBeVisible(); await expect(page.getByRole("link", { name: "Administration" })).toBeVisible();
});

test("signed-out visitors cannot reach terminal or file mutation surfaces", async ({ page }) => {
  await page.goto("/login"); const health = await page.request.get("/api/health/live"); expect(health.headers()["x-content-type-options"]).toBe("nosniff"); const files = await page.request.get("/api/files"); expect(files.status()).toBe(401); const terminal = await page.request.post("/api/admin/terminal/token", { headers: { Origin: "http://127.0.0.1:3199" }, data: {} }); expect(terminal.status()).toBe(403);
});
