import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminShell } from "./admin-shell";
describe("admin UI", () => { it("renders the administrative shell", () => { render(<AdminShell><p>Accounts</p></AdminShell>); expect(screen.getByText("Accounts")).toBeInTheDocument(); }); });
