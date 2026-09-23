import { describe, expect, it } from "vitest";
import { beginFolderRead, hasActiveFolderReads } from "./folder-read-priority";

describe("folder read priority", () => {
  it("tracks active interactive folder reads", () => {
    expect(hasActiveFolderReads()).toBe(false);
    const release = beginFolderRead();
    expect(hasActiveFolderReads()).toBe(true);
    release();
    expect(hasActiveFolderReads()).toBe(false);
  });
});
