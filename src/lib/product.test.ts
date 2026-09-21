import { describe, expect, it } from "vitest";
import { PRODUCT } from "./product";

describe("PRODUCT", () => {
  it("uses the approved identity", () => {
    expect(PRODUCT).toEqual({
      name: "DOE SPARK",
      shortName: "SPARK",
      description: "Secure Platform for Archives, Records, and Knowledge",
    });
  });
});
