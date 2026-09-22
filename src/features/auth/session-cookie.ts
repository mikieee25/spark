import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export const SESSION_COOKIE_NAME = "spark_session";

function shouldUseSecureCookie(): boolean {
  const configuredOrigin = process.env.SPARK_ORIGIN;
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).protocol === "https:";
    } catch {
      // Configuration validation reports the useful error before login.
    }
  }
  return process.env.NODE_ENV === "production";
}

export function sessionCookieOptions(expires: Date): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookie(),
    path: "/",
    expires,
  };
}
