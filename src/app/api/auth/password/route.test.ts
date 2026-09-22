// @vitest-environment node
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
describe("password route contract", () => {
  it("is covered by the route implementation", async () => {
    const route = await import("./route");
    expect(route.POST).toBeTypeOf("function");
  });
});
