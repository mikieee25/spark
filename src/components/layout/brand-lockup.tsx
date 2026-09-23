import Image from "next/image";
import { PRODUCT } from "@/lib/product";

export function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3" aria-label={PRODUCT.name}>
      <Image
        src="/spark-icon.svg"
        alt="SPARK icon"
        width={48}
        height={48}
        className="size-11 shrink-0 rounded-xl object-cover shadow-lg"
      />
      {!compact && (
        <span>
          <strong className="block text-lg tracking-[0.18em]">SPARK</strong>
          <small className="block text-[11px] text-muted-foreground">
            Archives · Records · Knowledge
          </small>
        </span>
      )}
    </div>
  );
}
