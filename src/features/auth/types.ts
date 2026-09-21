export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
};

export type AuthResult =
  | { ok: true; user: SessionUser; token: string; expiresAt: Date }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "locked" };
