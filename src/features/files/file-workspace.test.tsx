import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileWorkspace } from "./file-workspace";
import type { FileEntry } from "./file-api";

const entries: FileEntry[] = [
  {
    name: "Reports",
    logicalPath: "Reports",
    kind: "folder",
    sizeBytes: 8,
    modifiedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    name: "Q3 Energy Outlook.pdf",
    logicalPath: "Q3 Energy Outlook.pdf",
    kind: "file",
    sizeBytes: 4_800,
    modifiedAt: "2026-09-22T00:00:00.000Z",
  },
  {
    name: "FY2027 Budget Model.xlsx",
    logicalPath: "FY2027 Budget Model.xlsx",
    kind: "file",
    sizeBytes: 1_200,
    modifiedAt: "2026-09-21T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  window.localStorage.clear();
});

describe("FileWorkspace", () => {
  it("renders a server-provided file workspace", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    expect(document.querySelector("[data-file-workspace]")).toHaveClass(
      "w-full"
    );
    expect(
      screen.getByRole("heading", { name: "Shared files" })
    ).toBeInTheDocument();
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Local-first workspace · OneDrive sync stays external to SPARK"
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText("3 items")).toHaveLength(1);
    expect(
      screen.getByRole("region", { name: "File list scroll area" })
    ).toHaveClass("min-h-0", "flex-1", "overflow-y-auto");
  });

  it("navigates to an ancestor from the breadcrumb", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).includes("/api/discovery/recent")
              ? { items: [] }
              : { path: "Energy", entries: [] }
          ),
          { status: 200 }
        )
    );
    render(
      <FileWorkspace
        initialPath="Energy/Reports/2026"
        initialEntries={entries}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Energy" }));

    await waitFor(() =>
      expect(
        screen.getByText("Energy", { selector: "p.mt-1" })
      ).toBeInTheDocument()
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/files?path=Energy",
      expect.anything()
    );
  });

  it("restores the saved view, sort, and page size preferences", async () => {
    window.localStorage.setItem(
      "spark-workspace-preferences",
      JSON.stringify({
        viewMode: "list",
        sortField: "modified",
        sortDirection: "desc",
        pageSize: 25,
      })
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "View mode" })).toHaveValue(
        "list"
      )
    );
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue(
      "modified"
    );
    expect(
      screen.getByRole("combobox", { name: "Workspace files rows per page" })
    ).toHaveValue("25");
    expect(
      screen.getByRole("button", { name: "Sort descending" })
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), {
      target: { value: "details" },
    });
    fireEvent.change(
      screen.getByRole("combobox", { name: "Auto-refresh interval" }),
      { target: { value: "15" } }
    );
    await waitFor(() =>
      expect(
        JSON.parse(
          window.localStorage.getItem("spark-workspace-preferences") ?? "{}"
        )
      ).toMatchObject({ viewMode: "details" })
    );
    expect(window.localStorage.getItem("spark-auto-refresh-seconds")).toBe(
      "15"
    );
  });

  it("uploads files dropped onto the workspace", async () => {
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/files/uploads")
        return new Response(JSON.stringify({ item: {} }), { status: 200 });
      if (url.startsWith("/api/files?"))
        return new Response(JSON.stringify({ path: "", entries }), {
          status: 200,
        });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.drop(document.querySelector("[data-file-workspace]")!, {
      dataTransfer: {
        types: ["Files"],
        items: [{ kind: "file", getAsFile: () => file }],
      },
    });

    expect(
      await screen.findByText("Uploaded 1 of 1 files.")
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/files/uploads",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
  });

  it("offers a short-lived undo after recycling a single item", async () => {
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "DELETE")
        return new Response(
          JSON.stringify({
            id: "recycle-1",
            originalPath: "Q3 Energy Outlook.pdf",
          }),
          { status: 200 }
        );
      if (url.includes("/restore"))
        return new Response(JSON.stringify({ entry: { id: "recycle-1" } }), {
          status: 200,
        });
      if (url.startsWith("/api/files?"))
        return new Response(JSON.stringify({ path: "", entries }), {
          status: 200,
        });
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Move to Recycle bin" })
    );
    fireEvent.click(
      screen.getAllByRole("button", { name: "Move to Recycle bin" }).at(-1)!
    );

    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/recycle/recycle-1/restore",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByText("Restored 1 item.")).toBeInTheDocument();
  });

  it("shows calculated folder sizes", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    expect(screen.getAllByText("8 B").length).toBeGreaterThan(0);
  });

  it("filters files by search term", () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          nextCursor: null,
          index: { status: "ready" },
        }),
        { status: 200 }
      )
    );
    render(
      <FileWorkspace
        initialPath=""
        initialEntries={entries}
        initialFavorites={[]}
        initialRecent={[]}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "budget" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/search?"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("searches folder names when the folder scope is selected", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [
            {
              name: "Reports",
              logicalPath: "Reports",
              kind: "folder",
              sizeBytes: 0,
              modifiedAt: "2026-09-22T00:00:00.000Z",
              extension: "",
              mimeType: "",
            },
          ],
          nextCursor: null,
          index: { status: "ready" },
        }),
        { status: 200 }
      )
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.change(
      screen.getByRole("combobox", { name: "Search item type" }),
      { target: { value: "folder" } }
    );
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "reports" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByRole("button", { name: "Open search result Reports" })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("kind=folder"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("renders search loading, results, selection, and empty states", async () => {
    let resolveSearch!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSearch = resolve;
        })
    );
    render(
      <FileWorkspace
        initialPath=""
        initialEntries={entries}
        initialFavorites={[]}
        initialRecent={[]}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "brief" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("Searching…")).toBeInTheDocument();
    resolveSearch(
      new Response(
        JSON.stringify({
          items: [
            {
              name: "brief.txt",
              logicalPath: "Reports/brief.txt",
              kind: "file",
              sizeBytes: 20,
              modifiedAt: "2026-09-22T00:00:00.000Z",
              extension: ".txt",
              mimeType: "text/plain",
            },
          ],
          nextCursor: null,
          index: { status: "ready" },
        }),
        { status: 200 }
      )
    );
    expect(
      await screen.findByRole("button", {
        name: /Open search result brief\.txt/i,
      })
    ).toBeInTheDocument();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          items: [],
          nextCursor: null,
          index: { status: "ready" },
        }),
        { status: 200 }
      )
    );
    fireEvent.change(input, { target: { value: "missing" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });

  it("labels incomplete search results and refreshes until indexing finishes", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            index: { status: "pending" },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                name: "search-fixture.txt",
                logicalPath: "search-fixture.txt",
                kind: "file",
                sizeBytes: 28,
                modifiedAt: "2026-09-22T00:00:00.000Z",
                extension: ".txt",
                mimeType: "text/plain",
              },
            ],
            nextCursor: null,
            index: { status: "ready" },
          }),
          { status: 200 }
        )
      );
    render(
      <FileWorkspace
        initialPath=""
        initialEntries={entries}
        initialFavorites={[]}
        initialRecent={[]}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "search fixture" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText(/Search index is building/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("No matches found")).not.toBeInTheDocument();
    expect(
      await screen.findByRole(
        "button",
        { name: /Open search result search-fixture\.txt/i },
        { timeout: 5_000 }
      )
    ).toBeInTheDocument();
  });

  it("shows search errors and retries the same query", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "SEARCH_ERROR" }), { status: 500 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [],
            nextCursor: null,
            index: { status: "ready" },
          }),
          { status: 200 }
        )
      );
    render(
      <FileWorkspace
        initialPath=""
        initialEntries={entries}
        initialFavorites={[]}
        initialRecent={[]}
      />
    );
    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "brief" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(
      await screen.findByText("Search is unavailable right now.")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
    expect(await screen.findByText("No matches found")).toBeInTheDocument();
  });

  it("updates the folder immediately and shows a skeleton while an uncached listing loads", async () => {
    let resolveListing!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListing = resolve;
        })
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Reports" }));
    expect(screen.getByRole("link", { name: "Reports" })).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Opening folder" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Loading folder contents" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Q3 Energy Outlook.pdf")).not.toBeInTheDocument();
    resolveListing(
      new Response(JSON.stringify({ path: "Reports", entries: [] }), {
        status: 200,
      })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Opening folder" })
      ).not.toBeInTheDocument()
    );
    expect(screen.getByText("This folder is empty")).toBeInTheDocument();
  });

  it("loads the initial folder after mounting when the server did not provide entries", async () => {
    let resolveListing!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveListing = resolve;
        })
    );
    render(<FileWorkspace initialPath="" initialEntries={null} />);
    expect(
      screen.getByRole("status", { name: "Loading folder contents" })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/files?path=", expect.anything());
    resolveListing(
      new Response(JSON.stringify({ path: "", entries }), { status: 200 })
    );
    expect(
      await screen.findByText("Q3 Energy Outlook.pdf")
    ).toBeInTheDocument();
  });

  it("offers a retry when the initial folder request fails", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("NETWORK_DOWN"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: "", entries }), { status: 200 })
      );
    render(<FileWorkspace initialPath="" initialEntries={null} />);
    expect(await screen.findByText("NETWORK_DOWN")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry folder" }));
    expect(
      await screen.findByText("Q3 Energy Outlook.pdf")
    ).toBeInTheDocument();
  });

  it("ignores an older folder response after navigating back", async () => {
    let resolveReports!: (value: Response) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveReports = resolve;
          })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ path: "", entries }), { status: 200 })
      );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.doubleClick(screen.getByRole("button", { name: "Reports" }));
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();

    resolveReports(
      new Response(
        JSON.stringify({
          path: "Reports",
          entries: [
            {
              ...entries[1],
              name: "Late result.pdf",
              logicalPath: "Reports/Late result.pdf",
            },
          ],
        }),
        { status: 200 }
      )
    );
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Late result.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
  });

  it("shows a previously visited folder immediately while revalidating it", async () => {
    const reportEntries = [
      { ...entries[1], name: "Brief.pdf", logicalPath: "Reports/Brief.pdf" },
    ];
    let resolveRootRefresh!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation((input) => {
      const url = String(input);
      if (url === "/api/files?path=Reports")
        return Promise.resolve(
          new Response(
            JSON.stringify({ path: "Reports", entries: reportEntries }),
            { status: 200 }
          )
        );
      if (url === "/api/files?path=")
        return new Promise((resolve) => {
          resolveRootRefresh = resolve;
        });
      return Promise.resolve(
        new Response(JSON.stringify({ items: [] }), { status: 200 })
      );
    });
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.doubleClick(screen.getByRole("button", { name: "Reports" }));
    expect(await screen.findByText("Brief.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));

    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Opening folder" })
    ).toBeInTheDocument();
    resolveRootRefresh(
      new Response(JSON.stringify({ path: "", entries }), { status: 200 })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Opening folder" })
      ).not.toBeInTheDocument()
    );
  });

  it("navigates to the parent folder with the back button", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ path: "Reports", entries: [entries[0]] }), {
        status: 200,
      })
    );
    render(
      <FileWorkspace initialPath="Reports/2026" initialEntries={entries} />
    );
    expect(screen.getByRole("button", { name: "Go back" })).toHaveTextContent(
      "Back"
    );
    expect(
      screen.getByRole("button", { name: "Go back" })
    ).not.toHaveTextContent("parent folder");
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(
      await screen.findByRole("link", { name: "Reports" })
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/files?path=Reports",
      expect.anything()
    );
  });

  it("selects an item on single click and opens its folder on double click", async () => {
    vi.mocked(fetch).mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).startsWith("/api/discovery/recent")
              ? { items: [] }
              : { path: "Reports", entries: [] }
          ),
          { status: 200 }
        )
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    const folder = screen.getByRole("button", { name: "Reports" });
    fireEvent.click(folder);
    expect(
      await screen.findByRole("dialog", { name: "Selected item details" })
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.doubleClick(folder);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/files?path=Reports",
        expect.anything()
      )
    );
  });

  it("shows file preview inside the blurred details drawer", async () => {
    const image = {
      ...entries[1],
      name: "DOE seal.png",
      logicalPath: "DOE seal.png",
    };
    render(<FileWorkspace initialPath="" initialEntries={[image]} />);

    fireEvent.click(screen.getByRole("button", { name: "DOE seal.png" }));

    expect(
      await screen.findByRole("dialog", { name: "Selected item details" })
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "Preview of DOE seal.png" })
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="sheet-overlay"]')
    ).toBeInTheDocument();
  });

  it("shows a folder icon preview inside the details drawer", async () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.click(screen.getByRole("button", { name: "Reports" }));

    expect(
      await screen.findByRole("region", { name: "Preview of Reports" })
    ).toBeInTheDocument();
    expect(
      screen
        .getByRole("region", { name: "Preview of Reports" })
        .querySelector("svg")
    ).toBeInTheDocument();
  });

  it("uses the wide responsive details drawer width", async () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.click(screen.getByRole("button", { name: "Reports" }));

    expect(
      await screen.findByRole("dialog", { name: "Selected item details" })
    ).toHaveClass("sm:!max-w-xl");
  });

  it("offers all Explorer view modes and sort controls", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    expect(screen.getByRole("combobox", { name: "View mode" })).toHaveValue(
      "details"
    );
    for (const mode of [
      "Extra large icons",
      "Large icons",
      "Medium icons",
      "Small icons",
      "List",
      "Details",
      "Tiles",
      "Content",
    ]) {
      expect(screen.getByRole("option", { name: mode })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("combobox", { name: "Sort by" })
    ).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: "View mode" }), {
      target: { value: "extra-large-icons" },
    });
    expect(
      screen.getByRole("region", { name: "Workspace files" })
    ).toHaveAttribute("data-view-mode", "extra-large-icons");
  });

  it("paginates workspace files and sorts entries by size", () => {
    const manyEntries = Array.from({ length: 51 }, (_, index) => ({
      ...entries[1],
      name: `File ${index + 1}.txt`,
      logicalPath: `File ${index + 1}.txt`,
      sizeBytes: 52 - index,
    }));
    render(<FileWorkspace initialPath="" initialEntries={manyEntries} />);

    expect(
      screen.getByRole("button", { name: "File 1.txt" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File 51.txt" })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("button", { name: "File 51.txt" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File 1.txt" })
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Sort by" }), {
      target: { value: "size" },
    });
    expect(
      screen.getByRole("button", { name: "File 51.txt" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "File 1.txt" })
    ).not.toBeInTheDocument();
  });

  it("opens file actions on right click and provides new-tab and new-window options", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    const openWindow = vi.spyOn(window, "open").mockReturnValue(null);
    fireEvent.contextMenu(screen.getByRole("button", { name: "Reports" }));

    expect(
      screen.getByRole("menuitem", { name: "Open in new tab" })
    ).toHaveAttribute("href", "/files?path=Reports");
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Open in new window" })
    );
    expect(openWindow).toHaveBeenCalledWith(
      "/files?path=Reports",
      "_blank",
      "popup,width=1200,height=800,noopener,noreferrer"
    );

    fireEvent.contextMenu(
      screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" })
    );
    expect(
      screen.getByRole("menuitem", { name: "Open in new tab" })
    ).toHaveAttribute("href", "/files?preview=Q3%20Energy%20Outlook.pdf");
  });

  it("refreshes the current folder at the selected interval", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            path: "",
            entries: [{ ...entries[0], name: "New Reports" }],
          }),
          { status: 200 }
        )
      );
      render(<FileWorkspace initialPath="" initialEntries={entries} />);
      fireEvent.change(screen.getByLabelText("Auto-refresh interval"), {
        target: { value: "15" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      expect(screen.getByText("New Reports")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/files?path=", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let an older auto-refresh overwrite a newly opened folder", async () => {
    vi.useFakeTimers();
    let resolveRefresh!: (value: Response) => void;
    try {
      vi.mocked(fetch)
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveRefresh = resolve;
            })
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              path: "Reports",
              entries: [
                {
                  ...entries[1],
                  name: "Brief.pdf",
                  logicalPath: "Reports/Brief.pdf",
                },
              ],
            }),
            { status: 200 }
          )
        );
      render(<FileWorkspace initialPath="" initialEntries={entries} />);
      fireEvent.change(screen.getByLabelText("Auto-refresh interval"), {
        target: { value: "15" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });

      fireEvent.doubleClick(screen.getByRole("button", { name: "Reports" }));
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(screen.getByText("Brief.pdf")).toBeInTheDocument();
      resolveRefresh(
        new Response(
          JSON.stringify({
            path: "",
            entries: [{ ...entries[1], name: "Stale root.pdf" }],
          }),
          { status: 200 }
        )
      );
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText("Stale root.pdf")).not.toBeInTheDocument();
      expect(screen.getByText("Brief.pdf")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("toggles favorites and renders recent items", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ favorite: { logicalPath: "Q3 Energy Outlook.pdf" } }),
        { status: 200 }
      )
    );
    render(
      <FileWorkspace
        initialPath=""
        initialEntries={entries}
        initialFavorites={[]}
        initialRecent={[
          {
            userId: "u1",
            logicalPath: "Reports/brief.txt",
            accessedAt: "2026-09-22T00:00:00.000Z",
          },
        ]}
      />
    );
    expect(
      screen.getByRole("button", { name: /Open recent item brief\.txt/i })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Add to favorites" })
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/discovery/favorites",
        expect.objectContaining({ method: "PUT" })
      )
    );
  });

  it("creates a folder through the API", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          item: {
            name: "Briefings",
            logicalPath: "Briefings",
            kind: "folder",
            sizeBytes: 0,
            modifiedAt: "2026-09-22T00:00:00.000Z",
          },
        }),
        { status: 200 }
      )
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), {
      target: { value: "Briefings" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() =>
      expect(screen.getByText("Briefings")).toBeInTheDocument()
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/files/folders",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("uploads a selected directory and reports progress", async () => {
    const file = new File(["DOE"], "brief.txt", { type: "text/plain" });
    Object.defineProperty(file, "webkitRelativePath", {
      value: "Reports/brief.txt",
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            item: {
              name: "Reports",
              logicalPath: "Reports",
              kind: "folder",
              sizeBytes: 0,
              modifiedAt: "2026-09-22T00:00:00.000Z",
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            item: {
              name: "brief.txt",
              logicalPath: "Reports/brief.txt",
              kind: "file",
              sizeBytes: 3,
              modifiedAt: "2026-09-22T00:00:00.000Z",
            },
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ entries }), { status: 200 })
      );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.change(screen.getByLabelText("Folder upload"), {
      target: { files: [file] },
    });
    expect(
      await screen.findByText("Uploaded 1 of 1 files.")
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/files/folders",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/files/uploads",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) })
    );
  });

  it("offers a folder download action", () => {
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Actions for Reports" })
    );
    expect(
      screen.getByRole("link", { name: "Download folder" })
    ).toHaveAttribute("href", "/api/files/download?path=Reports");
  });

  it("selects all items in the current folder across pages", () => {
    const manyEntries = Array.from({ length: 51 }, (_, index) => ({
      ...entries[1],
      name: `File ${index + 1}.txt`,
      logicalPath: `File ${index + 1}.txt`,
    }));
    render(<FileWorkspace initialPath="" initialEntries={manyEntries} />);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all items in current folder",
      })
    );

    expect(screen.getByText("51 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(
      screen.getByRole("checkbox", { name: "Deselect File 51.txt" })
    ).toBeChecked();
  });

  it("confirms batch recycling and keeps failed items selected", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          succeeded: ["Reports"],
          failed: [{ path: "Q3 Energy Outlook.pdf", error: "LOCKED" }],
          undo: [{ id: "recycle-reports", path: "Reports" }],
        }),
        { status: 200 }
      )
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Reports" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select Q3 Energy Outlook.pdf" })
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Move selected to Recycle bin" })
    );
    expect(
      screen.getByRole("heading", { name: "Move 2 items to Recycle bin?" })
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(
      screen
        .getAllByRole("button", { name: "Move 2 items to Recycle bin" })
        .at(-1)!
    );

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/files/batch",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(
      await screen.findByText(/1 item moved to Recycle bin; 1 failed/)
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Reports", { exact: true })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Deselect Q3 Energy Outlook.pdf" })
    ).toBeChecked();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("requires confirmation before moving an item to recycle", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 })
    );
    render(<FileWorkspace initialPath="" initialEntries={entries} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Q3 Energy Outlook.pdf" })
    );
    await screen.findByRole("button", { name: "Move to Recycle bin" });
    fireEvent.click(
      screen.getByRole("button", { name: "Move to Recycle bin" })
    );
    expect(screen.getByRole("dialog")).toBeVisible();
    const recycleButtons = screen.getAllByRole("button", {
      name: "Move to Recycle bin",
    });
    fireEvent.click(recycleButtons[recycleButtons.length - 1]);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/files?path="),
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });
});
