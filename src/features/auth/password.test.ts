// @vitest-environment node
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("passwords", () => {
  it("hashes with Argon2id and verifies the right password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(
      verifyPassword(hash, "correct horse battery staple")
    ).resolves.toBe(true);
    await expect(verifyPassword(hash, "wrong password")).resolves.toBe(false);
  });

  it("uses a unique salt", async () => {
    const first = await hashPassword("correct horse battery staple");
    const second = await hashPassword("correct horse battery staple");
    expect(first).not.toBe(second);
  });

  it("requires 12 to 128 Unicode characters", async () => {
    await expect(hashPassword("short")).rejects.toThrow("12 to 128");
    await expect(hashPassword("🙂".repeat(129))).rejects.toThrow("12 to 128");
  });

  it("requires at least 6 Unicode lowercase letters", async () => {
    await expect(hashPassword("ABCDEFGHIJKL12")).rejects.toThrow("6 lowercase");
    await expect(hashPassword("áéíóúñ123456")).resolves.toMatch(
      /^\$argon2id\$/
    );
  });
});
