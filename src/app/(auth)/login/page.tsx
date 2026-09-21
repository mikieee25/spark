import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { getCurrentUser } from "@/features/auth/request-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/files");
  return <main className="grid min-h-screen bg-[var(--canvas)] lg:grid-cols-[1.1fr_0.9fr]"><section className="relative hidden overflow-hidden bg-[var(--canvas-deep)] p-14 text-white lg:flex lg:flex-col lg:justify-between"><div className="absolute -right-32 top-20 size-96 rounded-full bg-[var(--doe-blue)] opacity-35 blur-3xl" /><p className="relative text-sm font-black uppercase tracking-[0.25em] text-[var(--doe-yellow)]">Department of Energy</p><div className="relative max-w-xl"><h1 className="text-6xl font-black leading-[1.02] tracking-tight">Secure knowledge. Shared momentum.</h1><p className="mt-6 text-lg leading-8 text-slate-300">A local-first home for DOE archives, records, and institutional knowledge.</p></div><p className="relative text-sm text-slate-400">SPARK · Secure Platform for Archives, Records, and Knowledge</p></section><section className="flex items-center justify-center p-6 sm:p-12"><div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--paper)] p-7 shadow-[var(--shadow)] sm:p-10"><BrandLockup /><h2 className="mt-10 text-3xl font-black tracking-tight">Welcome back</h2><p className="mt-2 text-[var(--ink-muted)]">Sign in with your local SPARK account.</p><LoginForm /></div></section></main>;
}
