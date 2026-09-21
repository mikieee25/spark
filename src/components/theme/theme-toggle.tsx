"use client";

import { useEffect } from "react";

export function ThemeToggle() {
  useEffect(() => {
    const value = localStorage.getItem("spark-theme") === "dark";
    document.documentElement.dataset.theme = value ? "dark" : "light";
    document.documentElement.classList.toggle("dark", value);
  }, []);
  function toggle() {
    const next = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = next ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("spark-theme", next ? "dark" : "light");
  }
  return <button type="button" onClick={toggle} aria-label="Toggle color theme" className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--paper)] text-lg">◐</button>;
}
