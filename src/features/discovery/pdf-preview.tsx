"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button";

export function PdfPreview({
  src,
  title,
  onReady,
  onError,
}: Readonly<{
  src: string;
  title: string;
  onReady?: () => void;
  onError?: () => void;
}>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentRef = useRef<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("pdfjs-dist/legacy/build/pdf.mjs")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();
        return pdfjs.getDocument({ url: src, withCredentials: true }).promise;
      })
      .then((document) => {
        if (cancelled) {
          void document.cleanup();
          return;
        }
        documentRef.current = document;
        setPages(document.numPages);
        setLoading(false);
        onReady?.();
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
          onError?.();
        }
      });
    return () => {
      cancelled = true;
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.cleanup();
    };
  }, [onError, onReady, src]);

  useEffect(() => {
    if (!documentRef.current || !canvasRef.current || !pages) return;
    let cancelled = false;
    void documentRef.current
      .getPage(page)
      .then((pdfPage) => {
        if (cancelled || !canvasRef.current) return;
        const viewport = pdfPage.getViewport({ scale: 1.25 });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("PDF_CANVAS_UNAVAILABLE");
        return pdfPage.render({ canvasContext: context, canvas, viewport })
          .promise;
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onError?.();
        }
      });
    return () => {
      cancelled = true;
    };
  }, [onError, page, pages]);

  if (failed)
    return (
      <div
        role="alert"
        className="flex min-h-56 items-center justify-center p-6 text-sm text-muted-foreground"
      >
        PDF preview unavailable. Download the file to open it.
      </div>
    );
  return (
    <div
      className="overflow-hidden rounded-lg border bg-muted/10"
      aria-label={title}
    >
      {loading ? (
        <div
          className="flex min-h-56 items-center justify-center p-6 text-sm text-muted-foreground"
          role="status"
        >
          Loading PDF preview…
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
            <span>
              Page {page} of {pages}
            </span>
            <span className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
              >
                Next
              </Button>
            </span>
          </div>
          <div className="max-h-[28rem] overflow-auto p-3">
            <canvas
              ref={canvasRef}
              className="mx-auto block max-w-full shadow-sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
