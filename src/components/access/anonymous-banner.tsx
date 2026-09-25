"use client";
import { useEffect, useState } from "react";
export function AnonymousBanner() {
  const [state, setState] = useState<{
    anonymous?: boolean;
    expiresAt?: string | null;
  }>({});
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    void fetch("/api/access/status", { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => {
        setState(value);
        setRemaining(
          value.expiresAt
            ? Math.max(0, new Date(value.expiresAt).getTime() - Date.now())
            : 0
        );
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!state.anonymous) return;
    const timer = window.setInterval(
      () => setRemaining((value) => Math.max(0, value - 1000)),
      1000
    );
    return () => window.clearInterval(timer);
  }, [state.anonymous]);
  if (!state.anonymous) return null;
  const seconds = Math.floor(remaining / 1000);
  const countdown = `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return (
    <div
      role="status"
      className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-center text-sm text-warning"
    >
      Read-only guest access · auto-locks in {countdown}
    </div>
  );
}
