import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/request-auth";
import { PasswordChangeForm } from "./password-change-form";
export default async function PasswordPage() { const user = await getCurrentUser(); if (!user) redirect("/login"); return <main className="mx-auto flex min-h-screen max-w-lg items-center px-6"><section className="w-full rounded-2xl border bg-card p-6 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--pulse)]">DOE SPARK</p><h1 className="mt-2 text-2xl font-semibold">Change your password</h1><p className="mt-2 text-sm text-muted-foreground">Your administrator issued a temporary password. Set a new password before continuing.</p><PasswordChangeForm /></section></main>; }
