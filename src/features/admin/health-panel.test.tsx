import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthPanel } from "./health-panel";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({ adminApi: { health: vi.fn() } }));

describe("HealthPanel", () => {
  beforeEach(() =>
    vi
      .mocked(adminApi.health)
      .mockResolvedValue({
        ok: true,
        checks: { index: "running" },
        runtimePerformance: {
          eventLoopP95Ms: 8.7,
          eventLoopMeanMs: 4.2,
          eventLoopMaxMs: 15.1,
          measuredAt: 1_700_000_000_000,
        },
      })
  );

  it("shows background indexing status", async () => {
    render(<HealthPanel />);
    expect(
      await screen.findByText("Indexing in background")
    ).toBeInTheDocument();
  });

  it("shows event-loop responsiveness for performance diagnosis", async () => {
    render(<HealthPanel />);
    expect(await screen.findByText(/8\.7 ms/)).toBeInTheDocument();
  });
});
