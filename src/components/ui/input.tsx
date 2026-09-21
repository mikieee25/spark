import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`min-h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 text-[var(--ink)] shadow-sm transition placeholder:text-[var(--ink-muted)] hover:border-[var(--pulse)] ${className}`} {...props} />;
}
