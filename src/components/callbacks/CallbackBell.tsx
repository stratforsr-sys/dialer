"use client";

import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";

export function CallbackBell() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch("/api/callbacks/count");
        if (res.ok) {
          const data = await res.json();
          setCount(data.count ?? 0);
        }
      } catch {
        // ignore
      }
    }

    fetchCount();
    const interval = setInterval(fetchCount, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <Link
      href="/callbacks"
      title="Återkomster"
      className="relative group flex items-center justify-center w-9 h-9 transition-all duration-150"
      style={{ borderRadius: "10px", color: "var(--text-dim)" }}
    >
      <Bell size={16} strokeWidth={1.8} />

      {count > 0 && (
        <span
          className="absolute -top-[3px] -right-[3px] min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full px-[3px]"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}

      {/* Tooltip */}
      <span
        className="pointer-events-none absolute left-full ml-3 whitespace-nowrap px-2 py-1 text-[11px] font-medium rounded-[6px] opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50"
        style={{
          background: "var(--text)",
          color: "var(--bg)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        Återkomster{count > 0 ? ` (${count})` : ""}
      </span>
    </Link>
  );
}
