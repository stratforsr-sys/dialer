"use client";

import { useEffect, useState } from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Load saved theme on mount
    const savedTheme = localStorage.getItem("telink-theme") || "light";
    const effectiveTheme = savedTheme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : savedTheme;

    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(effectiveTheme);
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    setMounted(true);
  }, []);

  // Prevent flash of wrong theme
  if (!mounted) {
    return (
      <div style={{ visibility: "hidden" }}>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}
