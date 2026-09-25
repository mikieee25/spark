import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnonymousBanner } from "./anonymous-banner";
describe("anonymous banner", () => {
  it("remains hidden when access is locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ json: async () => ({ anonymous: false }) })
    );
    render(<AnonymousBanner />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
