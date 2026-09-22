// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), storage: vi.fn(), preview: vi.fn(), database: vi.fn(), recent: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({ getFileStorage: mocks.storage }));
vi.mock("@/features/discovery/preview-service", () => ({ createPreviewService: () => ({ preview: mocks.preview }) }));
vi.mock("@/lib/db/runtime", () => ({ getDatabase: mocks.database }));
vi.mock("@/features/discovery/discovery-repository", () => ({ addRecentItem: mocks.recent }));
import { GET } from "./route";

beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); mocks.storage.mockReturnValue({}); mocks.database.mockReturnValue({}); });

describe("preview route", () => {
  it("requires auth and private no-store responses", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request("http://spark.test/api/files/preview?path=note.txt"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns JSON text previews", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.preview.mockResolvedValue({ kind: "text", logicalPath: "note.txt", mimeType: "text/plain", content: "DOE", truncated: false, sizeBytes: 3 });
    const response = await GET(new Request("http://spark.test/api/files/preview?path=note.txt"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ kind: "text", content: "DOE" });
    expect(mocks.recent).toHaveBeenCalledWith({}, "user-1", "note.txt");
  });

  it("returns range headers for inline media", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.preview.mockResolvedValue({ kind: "media", logicalPath: "clip.mp4", mimeType: "video/mp4", body: Buffer.from("2345"), start: 2, end: 5, totalBytes: 10, partial: true });
    const response = await GET(new Request("http://spark.test/api/files/preview?path=clip.mp4", { headers: { Range: "bytes=2-5" } }));
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.arrayBuffer()).toEqual(Buffer.from("2345").buffer);
  });

  it("keeps private headers when authentication or storage fails", async () => {
    mocks.user.mockRejectedValue(new Error("AUTH_FAILURE"));
    const authResponse = await GET(new Request("http://spark.test/api/files/preview?path=note.txt"));
    expect(authResponse.status).toBe(500);
    expect(authResponse.headers.get("cache-control")).toBe("private, no-store");

    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.preview.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const missingResponse = await GET(new Request("http://spark.test/api/files/preview?path=note.txt"));
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns an explicit unsupported response for SVG previews", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.preview.mockRejectedValue(new Error("UNSUPPORTED_PREVIEW"));
    const response = await GET(new Request("http://spark.test/api/files/preview?path=unsafe.svg"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "UNSUPPORTED_PREVIEW" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
