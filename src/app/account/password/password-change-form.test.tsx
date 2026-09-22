import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordChangeForm } from "./password-change-form";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("PasswordChangeForm", () => {
  it("submits the password change and redirects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<PasswordChangeForm />);
    fireEvent.change(screen.getByLabelText("Temporary password"), { target: { value: "temporary-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-with-six-lowercase" } });
    expect(screen.getByRole("button", { name: "Save password" })).toHaveAttribute("type", "submit");
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/auth/password", expect.objectContaining({ method: "POST" })));
    expect(push).toHaveBeenCalledWith("/files");
    expect(refresh).toHaveBeenCalled();
  });

  it("explains an origin mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "INVALID_ORIGIN" }) }));
    render(<PasswordChangeForm />);
    fireEvent.change(screen.getByLabelText("Temporary password"), { target: { value: "temporary-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-with-six-lowercase" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("SPARK_ORIGIN");
  });
});
