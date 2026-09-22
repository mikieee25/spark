import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecycleWorkspace } from "./recycle-workspace";

const entry = { id: "entry-1", originalPath: "Reports/old.txt", storageKey: "entry-1", itemType: "file" as const, sizeBytes: 42, deletedAt: "2026-09-22T00:00:00.000Z", expiresAt: "2026-10-22T00:00:00.000Z", deletedBy: "user-1", operationId: "op-1", restoredAt: null, restoredBy: null, expiredAt: null, purgedAt: null, purgedBy: null, metadata: {}, state: "active" as const };

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("RecycleWorkspace", () => {
  it("hides permanent purge from regular users", () => {
    render(<RecycleWorkspace entries={[entry]} userRole="user" />);
    expect(screen.getByText("Reports/old.txt")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Permanently delete" })).not.toBeInTheDocument();
  });

  it("offers an explicit replace choice when restore encounters a conflict", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "CONFLICT" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entry }), { status: 200 }));
    render(<RecycleWorkspace entries={[entry]} userRole="user" />);
    await screen.findByText("Reports/old.txt");
    screen.getByRole("button", { name: "Restore" }).click();
    expect(await screen.findByText("A file or folder already exists at the original destination.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Restore and replace" }).click();
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1]?.[1]).toEqual(expect.objectContaining({ body: JSON.stringify({ conflict: "replace" }) }));
  });
});
