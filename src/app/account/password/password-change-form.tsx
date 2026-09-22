"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PasswordChangeForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(form: HTMLFormElement) {
    setPending(true);
    setError("");
    const data = new FormData(form);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: window.location.origin },
        body: JSON.stringify({ currentPassword: data.get("currentPassword"), newPassword: data.get("newPassword") }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: string } | null;
        setError(result?.error === "INVALID_ORIGIN"
          ? "This page address is not configured as SPARK_ORIGIN. Open SPARK using its configured URL."
          : "Password change failed. Check the temporary password and requirements.");
        return;
      }
      router.push("/files");
      router.refresh();
    } catch {
      setError("SPARK could not be reached. Try again.");
    } finally {
      setPending(false);
    }
  }

  return <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}><label className="grid gap-2 text-sm font-medium">Temporary password<Input name="currentPassword" type="password" required autoComplete="current-password" /></label><label className="grid gap-2 text-sm font-medium">New password<Input name="newPassword" type="password" required minLength={12} maxLength={128} autoComplete="new-password" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save password"}</Button></form>;
}
