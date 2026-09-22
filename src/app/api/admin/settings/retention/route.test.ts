// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("retention route", () => { it("exports GET and PATCH", async () => { const route = await import("./route"); expect(route.GET).toBeTypeOf("function"); expect(route.PATCH).toBeTypeOf("function"); }); });
