export type AdminUserView = {
  id: string;
  username: string;
  displayName: string;
  role: "user" | "admin";
  disabledAt: string | null;
  mustChangePassword: boolean;
};
export type AccessSettingsView = {
  requireSignIn: boolean;
  expiresAt: string | null;
  reason: string | null;
};
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "REQUEST_FAILED");
  return body as T;
}
export const adminApi = {
  users: () => request<{ users: AdminUserView[] }>("/api/admin/users"),
  createUser: (body: unknown) =>
    request<{ user: AdminUserView }>("/api/admin/users", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateUser: (body: unknown) =>
    request<{ ok: true }>("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  access: () => request<AccessSettingsView>("/api/admin/access"),
  setAccess: (body: unknown) =>
    request<AccessSettingsView>("/api/admin/access", {
      method: "PATCH",
      headers: { Origin: window.location.origin },
      body: JSON.stringify(body),
    }),
  activity: () => request<{ items: unknown[] }>("/api/admin/activity"),
  retention: () =>
    request<{ retentionDays: number }>("/api/admin/settings/retention"),
  setRetention: (days: number) =>
    request<{ retentionDays: number }>("/api/admin/settings/retention", {
      method: "PATCH",
      body: JSON.stringify({ retentionDays: days }),
    }),
  health: () => request<Record<string, unknown>>("/api/admin/health"),
};
