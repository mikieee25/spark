import { afterEach, describe, expect, it } from "vitest";
import { sessionCookieOptions } from "./session-cookie";

const originalOrigin = process.env.SPARK_ORIGIN;

afterEach(() => {
  process.env.SPARK_ORIGIN = originalOrigin;
});

describe("session cookie options", () => {
  it("does not require Secure for an HTTP deployment", () => {
    process.env.SPARK_ORIGIN = "http://10.20.27.59:38173";
    expect(sessionCookieOptions(new Date()).secure).toBe(false);
  });

  it("requires Secure for an HTTPS deployment", () => {
    process.env.SPARK_ORIGIN = "https://spark.example.test";
    expect(sessionCookieOptions(new Date()).secure).toBe(true);
  });
});
