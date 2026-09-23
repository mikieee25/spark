import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HealthPanel } from "./health-panel";
import { adminApi } from "./admin-api";

vi.mock("./admin-api", () => ({ adminApi: { health: vi.fn() } }));

describe("HealthPanel", () => {
  beforeEach(() => vi.mocked(adminApi.health).mockResolvedValue({ ok: true, checks: { index: "running" } }));

  it("shows background indexing status", async () => {
    render(<HealthPanel />);
    expect(await screen.findByText("Indexing in background")).toBeInTheDocument();
  });
});
