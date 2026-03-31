"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ResearchJob, ResearchRequest, ProgressiveMode } from "@/types/research";

interface UseResearchReturn {
  job: ResearchJob | null;
  loading: boolean;
  error: string | null;
  startResearch: (request: ResearchRequest) => Promise<void>;
  reset: () => void;
  progressiveMode: ProgressiveMode;
}

function getProgressiveMode(meetingAt?: string): ProgressiveMode {
  if (!meetingAt) return "full";
  const diff = new Date(meetingAt).getTime() - Date.now();
  const hours = diff / (1000 * 60 * 60);
  if (hours > 48) return "full";
  if (hours > 2) return "bullets";
  if (hours > 1 / 6) return "minimal"; // ~10 minutes
  return "stripped";
}

export function useResearch(): UseResearchReturn {
  const [job, setJob] = useState<ResearchJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/research/${jobId}`);
      if (!res.ok) return;
      const data: ResearchJob = await res.json();
      setJob(data);
      if (data.status === "complete" || data.status === "failed") {
        stopPolling();
        setLoading(false);
        if (data.status === "failed") {
          setError(data.error ?? "Research misslyckades");
        }
      }
    } catch {
      // ignore poll errors
    }
  }, [stopPolling]);

  const startResearch = useCallback(async (request: ResearchRequest) => {
    stopPolling();
    setLoading(true);
    setError(null);
    setJob(null);

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Kunde inte starta research");
      }

      const { job_id } = await res.json();

      // Poll every 2 seconds
      pollRef.current = setInterval(() => poll(job_id), 2000);
      // Also poll immediately
      await poll(job_id);
    } catch (err) {
      setLoading(false);
      setError(err instanceof Error ? err.message : "Okänt fel");
    }
  }, [poll, stopPolling]);

  const reset = useCallback(() => {
    stopPolling();
    setJob(null);
    setLoading(false);
    setError(null);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const progressiveMode = getProgressiveMode(job?.request.meeting_at);

  return { job, loading, error, startResearch, reset, progressiveMode };
}
