import argon2 from "argon2";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MIN_LOWERCASE_LETTERS = 6;

function unicodeLength(value: string): number {
  return Array.from(value).length;
}

function lowercaseLetterCount(value: string): number {
  return Array.from(value).filter((character) => /\p{Ll}/u.test(character))
    .length;
}

export async function hashPassword(password: string): Promise<string> {
  const length = unicodeLength(password);
  if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new Error("Password must contain 12 to 128 Unicode characters");
  }
  if (lowercaseLetterCount(password) < MIN_LOWERCASE_LETTERS) {
    throw new Error("Password must contain at least 6 lowercase letters");
  }
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  if (unicodeLength(password) > MAX_PASSWORD_LENGTH) return false;
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
