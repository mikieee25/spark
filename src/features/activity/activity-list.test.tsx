import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ActivityList } from "./activity-list";
import type { ActivityEvent } from "./activity-repository";

describe("ActivityList", () => {
  it("paginates activity records", () => {
    const events: ActivityEvent[] = Array.from({ length: 26 }, (_, index) => ({
      id: `event-${index + 1}`,
      occurredAt: "2026-09-22T00:00:00.000Z",
      actorUserId: "user-1",
      actorType: "user",
      actorUsername: "alex",
      actorDisplayName: "Alex",
      action: `FILE_${index + 1}`,
      paths: [],
      operationId: null,
      outcome: "success",
      errorCode: null,
      metadata: {},
    }));
    render(<ActivityList events={events} />);

    expect(screen.getByText("FILE 1")).toBeInTheDocument();
    expect(screen.queryByText("FILE 26")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("FILE 26")).toBeInTheDocument();
    expect(screen.queryByText("FILE 1")).not.toBeInTheDocument();
  });
});
