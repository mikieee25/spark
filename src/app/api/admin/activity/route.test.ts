// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("admin activity route", () => { it("exports GET", async () => { const route = await import("./route"); expect(route.GET).toBeTypeOf("function"); }); });
