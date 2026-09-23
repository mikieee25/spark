import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AdminShell } from "./admin-shell";
import { AccessSettings } from "./access-settings";
import { UserManagement } from "./user-management";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ users: [] }) }));
});

describe("admin UI", () => { it("renders the administrative shell", () => { render(<AdminShell><p>Accounts</p></AdminShell>); expect(screen.getByText("Accounts")).toBeInTheDocument(); }); });

describe("access settings", () => {
  it("loads the policy and confirms anonymous access before saving", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ requireSignIn: true, expiresAt: null, reason: null }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ requireSignIn: false, expiresAt: "2026-09-22T01:00:00.000Z", reason: "Review" }), { status: 200 }));
    render(<AccessSettings />);
    const toggle = await screen.findByRole("switch", { name: "Allow anonymous read-only access" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Access duration")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save policy" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and enable" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/admin/access", expect.objectContaining({ method: "PATCH" })));
    expect(screen.getByText("Access policy saved")).toBeInTheDocument();
  });
});

describe("user management", () => {
  it("uses a submit button for account creation", () => {
    render(<UserManagement />);
    expect(screen.getByRole("button", { name: "Create account" })).toHaveAttribute("type", "submit");
  });

  it("confirms and saves an administrator role change", async () => {
    const user = { id: "user-1", username: "alex", displayName: "Alex", role: "user", disabledAt: null, mustChangePassword: false };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ users: [user] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    render(<UserManagement />);
    fireEvent.click(await screen.findByRole("button", { name: "Change Alex role to administrator" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Make administrator" }));
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith("/api/admin/users", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ userId: "user-1", role: "admin" }) })));
    expect(screen.getByText(/alex · Administrator/i)).toBeInTheDocument();
  });
});
