"use client";

import { useState, useEffect, useCallback } from "react";

export type Theme = "light" | "dark" | "system";

const THEME_KEY = "telink-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getEffectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return getSystemTheme();
  }
  return theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  // Apply theme to document
  useEffect(() => {
    if (!mounted) return;

    const effectiveTheme = getEffectiveTheme(theme);
    const root = document.documentElement;

    // Remove both classes first
    root.classList.remove("light", "dark");
    // Add the effective theme class
    root.classList.add(effectiveTheme);

    // Also set data attribute for CSS
    root.setAttribute("data-theme", effectiveTheme);
  }, [theme, mounted]);

  // Listen for system theme changes when using "system" mode
  useEffect(() => {
    if (!mounted || theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const effectiveTheme = getSystemTheme();
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(effectiveTheme);
      root.setAttribute("data-theme", effectiveTheme);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem(THEME_KEY, newTheme);
  }, []);

  return {
    theme,
    setTheme,
    effectiveTheme: mounted ? getEffectiveTheme(theme) : "dark",
    mounted,
  };
}
