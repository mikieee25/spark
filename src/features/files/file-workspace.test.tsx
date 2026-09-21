import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileWorkspace } from "./file-workspace";

describe("FileWorkspace", () => {
  it("renders the mocked file workspace", () => {
    render(<FileWorkspace />);
    expect(screen.getByRole("heading", { name: "Shared files" })).toBeInTheDocument();
    expect(screen.getByText("Q3 Energy Outlook.pdf")).toBeInTheDocument();
    expect(screen.getByText("Local-first workspace · OneDrive sync stays external to SPARK")).toBeInTheDocument();
  });

  it("filters files by search term", () => {
    render(<FileWorkspace />);
    const search = screen.getByRole("textbox", { name: "Search workspace" });
    fireEvent.change(search, { target: { value: "budget" } });
    expect(screen.getByText("FY2027 Budget Model.xlsx")).toBeInTheDocument();
    expect(screen.queryByText("Q3 Energy Outlook.pdf")).not.toBeInTheDocument();
  });

  it("creates a mock folder through the dialog", async () => {
    render(<FileWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: "New folder" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(screen.getByRole("textbox", { name: "Folder name" }), { target: { value: "Briefings" } });
    fireEvent.click(screen.getByRole("button", { name: "Create folder" }));
    await waitFor(() => expect(screen.getByText("Briefings")).toBeInTheDocument());
    expect(dialog).not.toBeVisible();
  });
});
