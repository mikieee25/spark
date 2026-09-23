"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adminApi, type AdminUserView } from "./admin-api";

function roleLabel(role: AdminUserView["role"]): string {
  return role === "admin" ? "Administrator" : "Standard user";
}

export function UserManagement() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUserView | null>(null);
  const [rolePending, setRolePending] = useState(false);

  useEffect(() => { void adminApi.users().then((result) => setUsers(result.users)).catch((reason: Error) => setError(reason.message)); }, []);

  async function create(form: HTMLFormElement) {
    setPending(true);
    setError("");
    const data = new FormData(form);
    try {
      const result = await adminApi.createUser({ username: data.get("username"), displayName: data.get("displayName"), password: data.get("password") });
      setUsers((current) => [...current, result.user]);
      form.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "CREATE_FAILED");
    } finally {
      setPending(false);
    }
  }

  async function toggle(user: AdminUserView) {
    try {
      await adminApi.updateUser({ userId: user.id, disabled: !user.disabledAt });
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, disabledAt: user.disabledAt ? null : new Date().toISOString() } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "UPDATE_FAILED");
    }
  }

  async function changeRole() {
    if (!roleTarget) return;
    const nextRole = roleTarget.role === "admin" ? "user" : "admin";
    setRolePending(true);
    setError("");
    try {
      await adminApi.updateUser({ userId: roleTarget.id, role: nextRole });
      setUsers((current) => current.map((item) => item.id === roleTarget.id ? { ...item, role: nextRole } : item));
      setRoleTarget(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "ROLE_UPDATE_FAILED");
    } finally {
      setRolePending(false);
    }
  }

  return <Card><CardHeader><CardTitle>Accounts</CardTitle></CardHeader><CardContent className="grid gap-4"><form className="grid gap-2 sm:grid-cols-3" onSubmit={(event) => { event.preventDefault(); void create(event.currentTarget); }}><Input name="username" placeholder="Username" required /><Input name="displayName" placeholder="Display name" required /><Input name="password" type="password" minLength={12} placeholder="Initial password" required /><Button type="submit" disabled={pending} className="sm:col-span-3">Create account</Button></form>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="divide-y rounded-lg border">{users.map((user) => <div className="flex flex-wrap items-center justify-between gap-3 p-3" key={user.id}><div><p className="font-medium">{user.displayName}</p><p className="text-xs text-muted-foreground">{user.username} · {roleLabel(user.role)}{user.disabledAt ? " · disabled" : ""}</p></div><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setRoleTarget(user)} disabled={rolePending} aria-label={`Change ${user.displayName} role to ${user.role === "admin" ? "standard user" : "administrator"}`}>{user.role === "admin" ? "Make standard user" : "Make administrator"}</Button><Button type="button" variant="outline" onClick={() => void toggle(user)}>{user.disabledAt ? "Reactivate" : "Disable"}</Button></div></div>)}</div><Dialog open={Boolean(roleTarget)} onOpenChange={(open) => { if (!open && !rolePending) setRoleTarget(null); }}><DialogContent><DialogHeader><DialogTitle>Change account role?</DialogTitle><DialogDescription>{roleTarget?.displayName} will change from {roleTarget && roleLabel(roleTarget.role)} to {roleTarget && roleLabel(roleTarget.role === "admin" ? "user" : "admin")}.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setRoleTarget(null)} disabled={rolePending}>Cancel</Button><Button type="button" variant={roleTarget?.role === "admin" ? "destructive" : "default"} onClick={() => void changeRole()} disabled={rolePending}>{rolePending ? "Saving…" : roleTarget?.role === "admin" ? "Make standard user" : "Make administrator"}</Button></DialogFooter></DialogContent></Dialog></CardContent></Card>;
}
