import Image from "next/image";
import { redirect } from "next/navigation";
import { BrandLockup } from "@/components/layout/brand-lockup";
import { getCurrentUser } from "@/features/auth/request-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/files");
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-canvas-hero p-14 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-32 top-20 size-96 rounded-full bg-doe-blue opacity-35 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <Image
            src="/DOE%20LOGO%20OFFICIAL%20PNG.png"
            alt="Department of Energy seal"
            width={64}
            height={64}
            className="size-14 shrink-0 rounded-xl object-cover shadow-lg ring-1 ring-white/15"
          />
          <p className="text-sm font-black uppercase tracking-[0.25em] text-doe-yellow">
            Department of Energy
          </p>
        </div>
        <div className="relative max-w-xl">
          <h1 className="text-6xl font-black leading-[1.02] tracking-tight">
            Secure knowledge. Shared momentum.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            A local-first home for DOE archives, records, and institutional knowledge.
          </p>
        </div>
        <div className="relative flex items-center gap-4">
          <div className="rounded-2xl bg-white p-2 shadow-xl">
            <Image
              src="/Bagong%20Pilipinas.png"
              alt="Bagong Pilipinas"
              width={88}
              height={88}
              className="size-20 object-contain"
            />
          </div>
          <p className="max-w-xs text-sm leading-6 text-slate-300">
            DOE · Secure Platform for Archives, Records, and Knowledge
          </p>
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-7 shadow-xl shadow-black/5 sm:p-10 dark:shadow-black/20">
          <BrandLockup />
          <h2 className="mt-10 text-3xl font-black tracking-tight">Welcome back</h2>
          <p className="mt-2 text-muted-foreground">Sign in with your local SPARK account.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
