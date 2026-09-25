"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { adminApi } from "./admin-api";
export function RetentionSettings() {
  const [days, setDays] = useState(30);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void adminApi.retention().then((result) => setDays(result.retentionDays));
  }, []);
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Recycle retention</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Retention days"
          className="h-9 rounded-lg border bg-background px-2"
          value={days}
          onChange={(event) => setDays(Number(event.target.value))}
        >
          {[7, 30, 60, 90].map((value) => (
            <option key={value} value={value}>
              {value} days
            </option>
          ))}
        </select>
        <Button
          onClick={() =>
            void adminApi
              .setRetention(days)
              .then(() => setNotice("Saved"))
              .catch(() => setNotice("Unable to save"))
          }
        >
          Save
        </Button>
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {notice}
        </span>
      </div>
    </section>
  );
}
