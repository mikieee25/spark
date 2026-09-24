// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), database: vi.fn(), search: vi.fn(), indexState: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/search-repository", () => ({ searchFiles: mocks.search }));
vi.mock("@/features/discovery/discovery-repository", () => ({ getIndexState: mocks.indexState }));

import { GET } from "./route";

beforeEach(() => {
  mocks.user.mockReset(); mocks.database.mockReset(); mocks.search.mockReset(); mocks.indexState.mockReset();
  mocks.indexState.mockReturnValue({ generation: 1, status: "idle" });
});

describe("search route", () => {
  it("requires authentication and private cache headers", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request("http://spark.test/api/search?q=alpha"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it("validates input and returns typed bounded results", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.database.mockReturnValue({});
    mocks.search.mockReturnValue({ items: [{ logicalPath: "docs/a.txt", name: "a.txt", kind: "file" }], nextCursor: null });
    const response = await GET(new Request("http://spark.test/api/search?q=alpha&path=docs&kind=file&limit=5"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ logicalPath: "docs/a.txt", name: "a.txt", kind: "file" }], nextCursor: null, index: { status: "ready" } });
    expect(mocks.search).toHaveBeenCalledWith({}, { query: "alpha", pathPrefix: "docs", kind: "file", limit: 5, cursor: undefined });
  });

  it("reports first-run indexing during the startup quiet period", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.database.mockReturnValue({});
    mocks.search.mockReturnValue({ items: [], nextCursor: null });
    mocks.indexState.mockReturnValue({ generation: 0, status: "idle" });
    const response = await GET(new Request("http://spark.test/api/search?q=alpha"));
    expect(await response.json()).toEqual({ items: [], nextCursor: null, index: { status: "pending" } });
  });

  it("reports active and failed indexing without exposing internal errors", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.database.mockReturnValue({});
    mocks.search.mockReturnValue({ items: [], nextCursor: null });
    mocks.indexState.mockReturnValue({ generation: 1, status: "running" });
    const running = await GET(new Request("http://spark.test/api/search?q=alpha"));
    expect(await running.json()).toEqual({ items: [], nextCursor: null, index: { status: "indexing" } });
    mocks.indexState.mockReturnValue({ generation: 1, status: "error", error: "private details" });
    const failed = await GET(new Request("http://spark.test/api/search?q=alpha"));
    expect(await failed.json()).toEqual({ items: [], nextCursor: null, index: { status: "error" } });
  });

  it("returns explicit errors for malformed queries", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    const response = await GET(new Request("http://spark.test/api/search?limit=0"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
  });

  it("rejects unsafe logical paths before searching", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    const response = await GET(new Request("http://spark.test/api/search?q=alpha&path=../secret"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "INVALID_REQUEST" });
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
