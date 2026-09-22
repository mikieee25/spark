import Image from "next/image";
import { PRODUCT } from "@/lib/product";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label={PRODUCT.name}>
      <Image
        src="/DOE%20LOGO%20OFFICIAL%20PNG.png"
        alt="Department of Energy seal"
        width={48}
        height={48}
        className="size-11 shrink-0 rounded-xl object-cover shadow-lg"
      />
      {!compact && (
        <span>
          <strong className="block text-lg tracking-[0.18em]">SPARK</strong>
          <small className="block text-[11px] text-[var(--ink-muted)]">
            Archives · Records · Knowledge
          </small>
        </span>
      )}
    </div>
  );
}
