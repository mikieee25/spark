// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), database: vi.fn(), list: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({ listFavorites: mocks.list, addFavorite: mocks.add, removeFavorite: mocks.remove }));
vi.mock("@/features/auth/origin", () => ({ hasValidMutationOrigin: () => true }));
import { GET, PUT } from "./route";
beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); });
describe("favorites routes", () => {
  it("requires auth and keeps responses private", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("lists only the current user's favorites", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" }); mocks.database.mockReturnValue({});
    mocks.list.mockReturnValue([{ userId: "u1", logicalPath: "docs/a.txt", createdAt: "now" }]);
    const response = await GET();
    expect(await response.json()).toEqual({ items: [{ userId: "u1", logicalPath: "docs/a.txt", createdAt: "now" }] });
    expect(mocks.list).toHaveBeenCalledWith({}, "u1");
  });
  it("validates origin and toggles a favorite idempotently", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" }); mocks.database.mockReturnValue({});
    mocks.add.mockReturnValue({ userId: "u1", logicalPath: "docs/a.txt", createdAt: "now" });
    const response = await PUT(new Request("http://spark.test/api/discovery/favorites", { method: "PUT", headers: { origin: "http://spark.test" }, body: JSON.stringify({ path: "docs/a.txt", favorite: true }) }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ favorite: { userId: "u1", logicalPath: "docs/a.txt", createdAt: "now" } });
    expect(mocks.add).toHaveBeenCalledWith({}, "u1", "docs/a.txt");
    const removeResponse = await PUT(new Request("http://spark.test/api/discovery/favorites", { method: "PUT", body: JSON.stringify({ path: "docs/a.txt", favorite: false }) }));
    expect(removeResponse.status).toBe(200); expect(await removeResponse.json()).toEqual({ favorite: null });
    expect(mocks.remove).toHaveBeenCalledWith({}, "u1", "docs/a.txt");
  });
  it("rejects malformed logical paths", async () => {
    mocks.user.mockResolvedValue({ id: "u1", role: "user" });
    const response = await PUT(new Request("http://spark.test/api/discovery/favorites", { method: "PUT", body: JSON.stringify({ path: "../secret", favorite: true }) }));
    expect(response.status).toBe(400); expect(mocks.add).not.toHaveBeenCalled();
  });
});
