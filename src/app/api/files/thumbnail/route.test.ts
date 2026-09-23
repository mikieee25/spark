// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), storage: vi.fn(), config: vi.fn(), thumbnail: vi.fn() }));
vi.mock("@/features/auth/request-auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/features/files/file-runtime", () => ({ getFileStorage: mocks.storage }));
vi.mock("@/lib/config/load-config", () => ({ loadConfig: mocks.config }));
vi.mock("@/features/discovery/thumbnail-service", () => ({ createThumbnailService: () => ({ getThumbnail: mocks.thumbnail }) }));
import { GET } from "./route";

beforeEach(() => { mocks.user.mockReset(); mocks.storage.mockReset(); mocks.config.mockReset(); mocks.thumbnail.mockReset(); mocks.storage.mockReturnValue({}); mocks.config.mockReturnValue({ dataDirectory: "C:/spark-data" }); });

describe("thumbnail route", () => {
  it("requires auth and keeps unauthorized responses uncached", async () => {
    mocks.user.mockResolvedValue(null);
    const response = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png"));
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns private image bytes", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.thumbnail.mockResolvedValue({ buffer: Buffer.from("image"), mimeType: "image/webp" });
    const response = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, max-age=300, must-revalidate");
    expect(response.headers.get("etag")).toMatch(/^"[a-f0-9]+"$/);
  });

  it("returns not modified for a matching thumbnail validator", async () => {
    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.thumbnail.mockResolvedValue({ buffer: Buffer.from("image"), mimeType: "image/webp" });
    const first = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png"));
    const response = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png", { headers: { "if-none-match": first.headers.get("etag") ?? "" } }));
    expect(response.status).toBe(304);
  });

  it("keeps private headers when auth or storage fails", async () => {
    mocks.user.mockRejectedValue(new Error("AUTH_FAILURE"));
    const authResponse = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png"));
    expect(authResponse.status).toBe(500);
    expect(authResponse.headers.get("cache-control")).toBe("private, no-store");

    mocks.user.mockResolvedValue({ id: "user-1", role: "user" });
    mocks.thumbnail.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    const missingResponse = await GET(new Request("http://spark.test/api/files/thumbnail?path=photo.png"));
    expect(missingResponse.status).toBe(404);
    expect(missingResponse.headers.get("cache-control")).toBe("private, no-store");
  });
});
