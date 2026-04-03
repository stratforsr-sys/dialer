"use client";

import { useState, useEffect, useCallback } from "react";
import type { DayStats } from "@/types";

const STORAGE_KEY = "telink_daily_stats";
const KEEP_DAYS = 30;

function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function loadAll(): Record<string, DayStats> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data: Record<string, DayStats>) {
  const keys = Object.keys(data).sort().slice(-KEEP_DAYS);
  const pruned: Record<string, DayStats> = {};
  keys.forEach((k) => { pruned[k] = data[k]; });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    // ignore
  }
}

const EMPTY_DAY = (date: string): DayStats => ({ date, calls: 0, meetings: 0, byList: {} });

export function useDailyStats() {
  const [stats, setStats] = useState<Record<string, DayStats>>({});

  useEffect(() => {
    setStats(loadAll());
  }, []);

  const recordCall = useCallback((isMeeting: boolean, listId: string) => {
    const date = todayKey();
    setStats((prev) => {
      const entry: DayStats = prev[date] ?? EMPTY_DAY(date);
      const updated: DayStats = {
        ...entry,
        calls: entry.calls + 1,
        meetings: isMeeting ? entry.meetings + 1 : entry.meetings,
        byList: { ...entry.byList, [listId]: (entry.byList[listId] ?? 0) + 1 },
      };
      const next = { ...prev, [date]: updated };
      saveAll(next);
      return next;
    });
  }, []);

  const getLast30Days = useCallback(
    (listId?: string): DayStats[] => {
      const days: DayStats[] = [];
      const now = new Date();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split("T")[0];
        const entry = stats[key];
        if (listId) {
          days.push({
            date: key,
            calls: entry?.byList?.[listId] ?? 0,
            meetings: 0,
            byList: entry?.byList ?? {},
          });
        } else {
          days.push(entry ?? EMPTY_DAY(key));
        }
      }
      return days;
    },
    [stats]
  );

  const todayStats: DayStats = stats[todayKey()] ?? EMPTY_DAY(todayKey());

  return { todayStats, getLast30Days, recordCall };
}
