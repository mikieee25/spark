"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field-error";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setPending(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      if (!response.ok) { setError("The username or password is incorrect."); requestAnimationFrame(() => errorRef.current?.focus()); return; }
      router.replace("/files"); router.refresh();
    } catch { setError("SPARK could not be reached. Try again."); requestAnimationFrame(() => errorRef.current?.focus()); }
    finally { setPending(false); }
  }
  return <form className="mt-8 grid gap-5" onSubmit={submit}><label className="grid gap-2 text-sm font-bold">Username<Input name="username" autoComplete="username" required maxLength={128} /></label><label className="grid gap-2 text-sm font-bold">Password<Input name="password" type="password" autoComplete="current-password" required maxLength={128} /></label><div ref={errorRef} tabIndex={-1} aria-live="assertive"><FieldError>{error}</FieldError></div><Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button></form>;
}
