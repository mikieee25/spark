export type UserRole = "user" | "admin";

export type UserRecord = {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: UserRole;
  failed_login_count: number;
  locked_until: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};
