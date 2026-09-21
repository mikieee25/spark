import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

const user = { id: "1", username: "alex", displayName: "Alex DOE", role: "user" as const };

describe("AppShell", () => {
  it("provides the standard responsive regions and navigation", () => {
    render(<AppShell user={user}><p>Workspace</p></AppShell>);
    expect(screen.getByLabelText("Sidebar")).toBeInTheDocument();
    expect(screen.getByLabelText("Header")).toBeInTheDocument();
    expect(screen.getByLabelText("Content")).toHaveTextContent("Workspace");
    expect(screen.getByRole("link", { name: "Files" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administration" })).not.toBeInTheDocument();
  });

  it("shows administration only to administrators", () => {
    render(<AppShell user={{ ...user, role: "admin" }}><p>Workspace</p></AppShell>);
    expect(screen.getByRole("link", { name: "Administration" })).toBeInTheDocument();
  });
});
