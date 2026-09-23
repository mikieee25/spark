import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileWorkspace } from "./file-workspace";
import type { FileEntry } from "./file-api";

const entries: FileEntry[] = [
  { name: "Reports", logicalPath: "Reports", kind: "folder", sizeBytes: 8, modifiedAt: "2026-09-22T00:00:00.000Z" },
  { name: "Q3 Energy Outlook.pdf", logicalPath: "Q3 Energy Outlook.pdf", kind: "file", sizeBytes: 4_800, modifiedAt: "2026-09-22T00:00:00.000Z" },
  { name: "FY2027 Budget Model.xlsx", logicalPath: "FY2027 Budget Model.xlsx", kind: "file", sizeBytes: 1_200, modifiedAt: "2026-09-21T00:00:00.000Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("FileWorkspace", () => {
  it("renders a server-provided file workspace", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    expect(screen.getByRole("heading", { name: "Shared files" })).toBeInTheDocument();
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
    expect(screen.getByText("Local-first workspace · OneDrive sync stays external to SPARK")).toBeInTheDocument();
  });

  it("shows calculated folder sizes", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    expect(screen.getAllByText("8 B").length).toBeGreaterThan(0);
  });

  it("filters files by search term", () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} initialFavorites={[]} initialRecent={[]} />);
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "budget" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/search?"), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("renders search loading, results, selection, and empty states", async () => {
    let resolveSearch!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveSearch = resolve; }));
    render(<FileWorkspace initialPath="" initialEntries={entries} initialFavorites={[]} initialRecent={[]} />);
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "brief" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Searching…")).toBeInTheDocument();
    resolveSearch(new Response(JSON.stringify({ items: [{ name: "brief.txt", logicalPath: "Reports/brief.txt", kind: "file", sizeBytes: 20, modifiedAt: "2026-09-22T00:00:00.000Z", extension: ".txt", mimeType: "text/plain" }], nextCursor: null }), { status: 200 }));
    expect(await screen.findByRole("button", { name: /Open search result brief\.txt/i })).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    fireEvent.change(input, { target: { value: "missing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });

  it("shows search errors and retries the same query", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "SEARCH_ERROR" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} initialFavorites={[]} initialRecent={[]} />);
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "brief" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("Search is unavailable right now.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });

  it("shows folder-opening feedback while retaining the current listing", async () => {
    let resolveListing!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((resolve) => { resolveListing = resolve; }));
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("status", { name: "Opening folder" })).toBeInTheDocument();
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
    resolveListing(new Response(JSON.stringify({ path: "Reports", entries: [] }), { status: 200 }));
    await waitFor(() => expect(screen.queryByRole("status", { name: "Opening folder" })).not.toBeInTheDocument());
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("navigates to the parent folder with the back button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ path: "Reports", entries: [entries[0]] }), { status: 200 }));
    render(<FileWorkspace initialPath="Reports/2026" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(await screen.findByText("Reports")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/files?path=Reports", expect.anything());
  });

  it("refreshes the current folder at the selected interval", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ path: "", entries: [{ ...entries[0], name: "New Reports" }] }), { status: 200 }));
      render(<FileWorkspace initialPath="" initialEntries={entries} />);
      fireEvent.change(screen.getByLabelText("Auto-refresh interval"), { target: { value: "15" } });
      await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
      expect(screen.getByText("New Reports")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/files?path=", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles favorites and renders recent items", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ favorite: { logicalPath: "Q3 Energy Outlook.pdf" } }), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} initialFavorites={[]} initialRecent={[{ userId: "u1", logicalPath: "Reports/brief.txt", accessedAt: "2026-09-22T00:00:00.000Z" }]} />);
    expect(screen.getByRole("button", { name: /Open recent item brief\.txt/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to favorites" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/discovery/favorites", expect.objectContaining({ method: "PUT" })));
  });

  it("creates a folder through the API", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ item: { name: "Briefings", logicalPath: "Briefings", kind: "folder", sizeBytes: 0, modifiedAt: "2026-09-22T00:00:00.000Z" } }), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Briefings" } });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() => expect(screen.getByText("Briefings")).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith("/api/files/folders", expect.objectContaining({ method: "POST" }));
  });

  it("uploads a selected directory and reports progress", async () => {
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", { value: "Reports/brief.txt" });
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { name: "Reports", logicalPath: "Reports", kind: "folder", sizeBytes: 0, modifiedAt: "2026-09-22T00:00:00.000Z" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ item: { name: "brief.txt", logicalPath: "Reports/brief.txt", kind: "file", sizeBytes: 3, modifiedAt: "2026-09-22T00:00:00.000Z" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ entries }), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.change(screen.getByLabelText("Folder upload"), { target: { files: [file] } });
    expect(await screen.findByText("Uploaded 1 of 1 files.")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/files/folders", expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenCalledWith("/api/files/uploads", expect.objectContaining({ method: "POST", body: expect.any(FormData) }));
  });

  it("offers a folder download action", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions for Reports" }));
    expect(screen.getByRole("link", { name: "Download folder" })).toHaveAttribute("href", "/api/files/download?path=Reports");
  });

  it("requires confirmation before moving an item to recycle", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Recycle bin" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    const recycleButtons = screen.getAllByRole("button", { name: "Move to Recycle bin" });
    fireEvent.click(recycleButtons[recycleButtons.length - 1]);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/files?path="), expect.objectContaining({ method: "DELETE" })));
  });
});
