import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./preview-panel";

beforeEach(() => vi.stubGlobal("fetch", vi.fn()));

describe("PreviewPanel", () => {
  it("shows a bounded text preview", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: "text",
          logicalPath: "Reports/brief.txt",
          mimeType: "text/plain",
          content: "DOE energy brief",
          truncated: false,
          sizeBytes: 16,
          modifiedAt: "2026-09-22T00:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    render(
      <PreviewPanel
        item={{
          name: "brief.txt",
          logicalPath: "Reports/brief.txt",
          mimeType: "text/plain",
        }}
      />
    );

    expect(await screen.findByText("DOE energy brief")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Download brief.txt" })
    ).toHaveAttribute("href", expect.stringContaining("/api/files/download"));
  });

  it("offers download when preview is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "UNSUPPORTED_PREVIEW" }), {
        status: 400,
      })
    );
    render(
      <PreviewPanel item={{ name: "model.xlsx", logicalPath: "model.xlsx" }} />
    );

    await waitFor(() =>
      expect(screen.getByText("Preview unavailable")).toBeInTheDocument()
    );
    expect(
      screen.getByRole("link", { name: "Download model.xlsx" })
    ).toBeInTheDocument();
  });

  it("uses the private thumbnail route for an image selected from the file list", () => {
    render(
      <PreviewPanel
        item={{ name: "diagram.png", logicalPath: "Reports/diagram.png" }}
      />
    );
    expect(
      screen.getByRole("img", { name: "Preview of diagram.png" })
    ).toHaveAttribute("src", expect.stringContaining("/api/files/thumbnail"));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("never renders a host path supplied outside the logical item", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "UNSUPPORTED_PREVIEW" }), {
        status: 400,
      })
    );
    render(
      <PreviewPanel
        item={{ name: "brief.txt", logicalPath: "Reports/brief.txt" }}
      />
    );
    await screen.findByText("Preview unavailable");
    expect(screen.queryByText(/D:\\/i)).not.toBeInTheDocument();
  });
});
