"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Skriv-bakom-kö för dispositioner.
 *
 * Den gamla cockpiten väntade in claim → logCall → 300 ms timeout innan den
 * gick vidare. Det är tre led av väntan mellan tangenttryckning och nästa
 * lead, varav det sista var en hårdkodad fördröjning utan syfte.
 *
 * Här går navigeringen först och skrivningen läggs i kö. Rätten att jobba
 * leadet är redan avgjord av arbetslåset, så det finns ingenting att invänta.
 * En post som fallerar hamnar i `failed` och visas som en diskret remsa —
 * säljaren är då flera leads längre fram och ska inte avbrytas.
 */

export interface QueuedDisposition {
  idempotencyKey: string;
  leadId: string;
  companyName: string;
  [key: string]: unknown;
}

export interface FailedDisposition {
  companyName: string;
  error: string;
}

export function useDispositionQueue() {
  const queueRef = useRef<QueuedDisposition[]>([]);
  const flushingRef = useRef(false);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<FailedDisposition[]>([]);

  const flush = useCallback(async (useKeepalive = false) => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    flushingRef.current = true;

    // Max 50 per anrop — samma tak som endpointen.
    const batch = queueRef.current.splice(0, 50);
    setPending(queueRef.current.length + batch.length);

    try {
      const res = await fetch("/api/dispositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch }),
        keepalive: useKeepalive,
        // Utan detta följer webbläsaren middlewares omdirigering till
        // inloggningen, får HTML tillbaka med status 200, och res.ok blir
        // sant. Kön skulle då lägga tillbaka posterna och försöka igen i all
        // evighet medan samtalen tyst gick förlorade.
        redirect: "manual",
      });

      // En utgången session ger 3xx eller ett ogenomskinligt svar. Det går
      // inte att lösa genom att försöka igen — säljaren måste logga in.
      if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400) || res.status === 401) {
        setFailed((prev) => [
          ...prev,
          ...batch.map((b) => ({
            companyName: b.companyName,
            error: "Sessionen har gått ut — logga in igen",
          })),
        ]);
        return; // posterna kastas medvetet: en omladdning löser inget
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) throw new Error("Oväntat svar");

      const data = (await res.json()) as {
        results: Array<{ key: string; ok: boolean; error?: string }>;
      };

      const bad = data.results.filter((r) => !r.ok);
      if (bad.length > 0) {
        setFailed((prev) => [
          ...prev,
          ...bad.map((r) => ({
            companyName:
              batch.find((b) => b.idempotencyKey === r.key)?.companyName ?? "Okänt lead",
            error: r.error ?? "Okänt fel",
          })),
        ]);
      }
    } catch (err) {
      // Nätverksfel: lägg tillbaka först i kön och försök igen vid nästa tick.
      queueRef.current.unshift(...batch);
      void err;
    } finally {
      flushingRef.current = false;
      setPending(queueRef.current.length);
    }
  }, []);

  const enqueue = useCallback(
    (item: QueuedDisposition) => {
      queueRef.current.push(item);
      setPending(queueRef.current.length);
      // Kort fördröjning så att två snabba dispositioner hamnar i samma anrop.
      setTimeout(() => void flush(), 150);
    },
    [flush]
  );

  // Periodisk tömning fångar upp poster som fastnat efter ett nätverksfel.
  useEffect(() => {
    const t = setInterval(() => void flush(), 5000);
    return () => clearInterval(t);
  }, [flush]);

  // Stängd flik: keepalive gör att webbläsaren skickar anropet färdigt även
  // efter att sidan rivits ner. Utan detta försvinner de sista samtalen.
  useEffect(() => {
    function onHide() {
      if (queueRef.current.length > 0) void flush(true);
    }
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      onHide();
    };
  }, [flush]);

  const dismissFailed = useCallback(() => setFailed([]), []);

  return { enqueue, pending, failed, dismissFailed, flush };
}
