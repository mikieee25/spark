"use client";

import { Button } from "@/components/ui/button";

export function PaginationControls({
  label,
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: Readonly<{
  label: string;
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}>) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(page, pageCount);
  const first = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, totalItems);

  return <nav aria-label={`${label} pagination`} className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground sm:px-6">
    <span aria-live="polite">{first}–{last} of {totalItems}</span>
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-2">Rows per page<select aria-label={`${label} rows per page`} className="h-9 rounded-lg border bg-background px-2 text-foreground" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
      <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1}>Previous</Button>
      <span aria-label={`Page ${currentPage} of ${pageCount}`}>{currentPage} / {pageCount}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= pageCount}>Next</Button>
    </div>
  </nav>;
}
