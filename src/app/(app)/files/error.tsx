"use client";

import { Button } from "@/components/ui/button";

export default function FilesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-auto grid min-h-64 max-w-xl place-items-center gap-3 text-center"
    >
      <div>
        <h1 className="text-xl font-semibold">Unable to load this workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The fileserver did not return a usable listing.
        </p>
        <Button className="mt-4" onClick={reset}>
          Retry
        </Button>
      </div>
    </div>
  );
}
