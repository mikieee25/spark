import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/features/auth/types";
import { SidebarNav } from "./sidebar-nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/files" }));
vi.mock("next/link", () => ({
  default: ({
    prefetch,
    ...props
  }: {
    prefetch?: boolean;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a data-prefetch={String(prefetch)} {...props} />
  ),
}));

const user: SessionUser = {
  id: "u1",
  username: "admin",
  displayName: "Administrator",
  role: "admin",
  mustChangePassword: false,
};

describe("SidebarNav", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not prefetch workspace routes from the sidebar", () => {
    render(<SidebarNav user={user} />);
    expect(screen.getAllByRole("link")).toHaveLength(4);
    expect(
      screen
        .getAllByRole("link")
        .every((link) => link.getAttribute("data-prefetch") === "false")
    ).toBe(true);
  });
});
