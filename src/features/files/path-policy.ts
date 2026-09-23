import path from "node:path";

const WINDOWS_RESERVED = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/;

export function validateName(name: string): string {
  if (!name || name === "." || name === ".." || name.length > 255 || WINDOWS_RESERVED.test(name)) {
    throw new Error("INVALID_NAME");
  }
  if (INVALID_NAME.test(name) || /[. ]$/.test(name)) throw new Error("INVALID_NAME");
  return name;
}

export function isSafeStorageName(name: string): boolean {
  try {
    validateName(name);
    return true;
  } catch {
    return false;
  }
}

export function normalizeLogicalPath(input: string): string {
  if (typeof input !== "string" || input.includes("\\") || input.includes("\u0000") || input.startsWith("/")) {
    throw new Error("INVALID_PATH");
  }
  if (input === "") return "";
  const segments = input.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("INVALID_PATH");
  return segments.map(validateName).join("/");
}

export function isContained(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
