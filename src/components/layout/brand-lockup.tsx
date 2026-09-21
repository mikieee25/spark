import { PRODUCT } from "@/lib/product";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-3" aria-label={PRODUCT.name}><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--doe-blue)] text-sm font-black tracking-tight text-[var(--doe-yellow)] shadow-lg">DOE</span>{!compact && <span><strong className="block text-lg tracking-[0.18em]">SPARK</strong><small className="block text-[11px] text-[var(--ink-muted)]">Archives · Records · Knowledge</small></span>}</div>;
}
