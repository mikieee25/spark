import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";
import { UserManagement } from "./user-management";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ users: [] }) }));
});

describe("admin UI", () => { it("renders the administrative shell", () => { render(<AdminShell><p>Accounts</p></AdminShell>); expect(screen.getByText("Accounts")).toBeInTheDocument(); }); });

describe("user management", () => {
  it("uses a submit button for account creation", () => {
    render(<UserManagement />);
    expect(screen.getByRole("button", { name: "Create account" })).toHaveAttribute("type", "submit");
  });
});
