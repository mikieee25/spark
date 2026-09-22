// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), origin: vi.fn(), config: vi.fn(), database: vi.fn(), mint: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/auth/origin", () => ({ hasValidMutationOrigin: mocks.origin }));
vi.mock("@/lib/config/load-config", () => ({ loadConfig: mocks.config }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/terminal/token-repository", () => ({ mintTerminalToken: mocks.mint }));
vi.mock("@/features/activity/activity-repository", () => ({ recordActivity: vi.fn() }));
import { POST } from "./route";
beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.origin.mockReturnValue(true); mocks.database.mockReturnValue({}); mocks.config.mockReturnValue({ terminalEnabled: false }); });
describe("terminal token route", () => {
  it("requires administrator access and explicit enablement", async () => { mocks.user.mockResolvedValue({ id: "u1", role: "admin" }); const request = new Request("http://spark.test/api/admin/terminal/token", { method: "POST", headers: { origin: "http://spark.test" }, body: "{}" }); expect((await POST(request)).status).toBe(409); mocks.config.mockReturnValue({ terminalEnabled: true }); mocks.user.mockResolvedValue({ id: "u1", role: "user" }); expect((await POST(request)).status).toBe(403); });
  it("returns a short-lived token with no-store headers", async () => { mocks.config.mockReturnValue({ terminalEnabled: true }); mocks.user.mockResolvedValue({ id: "u1", role: "admin" }); mocks.mint.mockReturnValue("one-time-token"); const response = await POST(new Request("http://spark.test/api/admin/terminal/token", { method: "POST", headers: { origin: "http://spark.test", "content-type": "application/json" }, body: JSON.stringify({ ttlSeconds: 60 }) })); expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("private, no-store"); await expect(response.json()).resolves.toEqual({ token: "one-time-token", expiresInSeconds: 60 }); });
});
