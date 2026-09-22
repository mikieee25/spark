import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBar } from "./search-bar";

afterEach(() => vi.useRealTimers());

describe("SearchBar", () => {
  it("submits immediately with Enter and announces loading", () => {
    const onSearch = vi.fn();
    render(<SearchBar loading onSearch={onSearch} />);

    const input = screen.getByRole("searchbox", { name: "Search workspace" });
    fireEvent.change(input, { target: { value: "energy outlook" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSearch).toHaveBeenCalledWith("energy outlook");
    expect(screen.getByText("Searching…")).toBeInTheDocument();
  });

  it("debounces non-empty searches", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    render(<SearchBar onSearch={onSearch} />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search workspace" }), { target: { value: "budget" } });
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);

    expect(onSearch).toHaveBeenCalledWith("budget");
  });
});
