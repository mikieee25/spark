import { loadConfig } from "@/lib/config/load-config";

export function hasValidMutationOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === loadConfig().origin.origin;
  } catch {
    return false;
  }
}
