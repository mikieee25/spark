// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), service: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({
  getFileService: mocks.service,
}));

import { GET } from "./route";
import { DELETE } from "./[id]/route";

beforeEach(() => {
  mocks.user.mockReset();
  mocks.service.mockReset();
});

describe("recycle routes", () => {
  it("keeps recycle listing private and requires authentication", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("does not allow non-admin purge", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    const response = await DELETE(
      new Request("http://spark.test/api/recycle/entry", {
        method: "DELETE",
        headers: { origin: "http://localhost:3000" },
      }),
      { params: Promise.resolve({ id: "entry" }) }
    );
    expect(response.status).toBe(403);
  });
});
