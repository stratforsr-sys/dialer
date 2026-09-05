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

/**
 * Hur många gånger ett serverfel skickas om innan kön ger upp och visar remsan.
 *
 * Taket finns för att en felklassning inte ska bli en tyst loop. Nätverksfel
 * räknas INTE mot det — se `flush`.
 */
const MAX_SERVERFORSOK = 6;

/** Väntetid före nästa försök: 1, 2, 4, 8, 16, 30 sekunder. */
function backoffMs(consecutiveFailures: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, consecutiveFailures - 1));
}

export function useDispositionQueue() {
  const queueRef = useRef<QueuedDisposition[]>([]);
  const flushingRef = useRef(false);
  /** Antal serverförsök per idempotensnyckel. Nollställs aldrig — nyckeln dör med posten. */
  const attemptsRef = useRef<Map<string, number>>(new Map());
  /** Tidigast tillåtna nästa försök, satt av backoffen. */
  const nextFlushAtRef = useRef(0);
  /** `flush` kan inte referera sig själv i sin egen definition — ref:en är vägen. */
  const flushRef = useRef<((useKeepalive?: boolean) => Promise<void>) | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState<FailedDisposition[]>([]);

  const flush = useCallback(async (useKeepalive = false) => {
    if (flushingRef.current || queueRef.current.length === 0) return;
    // Backoffen hoppas över när fliken stängs: det här är sista chansen att få
    // iväg samtalen, och att vänta ut en timer är att kasta dem.
    if (!useKeepalive && Date.now() < nextFlushAtRef.current) return;
    flushingRef.current = true;

    // Tio per anrop, inte femtio. Endpointen klarar femtio, men den skriver
    // dem sekventiellt och en kall Turso-läsning kostar sekunder — ett fullt
    // block hann inte klart inom `maxDuration` och dödades mitt i. Tio poster
    // ryms med marginal, och det som ändå inte hinns med kommer tillbaka i
    // `unprocessed` utan att räknas som ett misslyckat försök.
    const batch = queueRef.current.splice(0, 10);
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
        results: Array<{ key: string; ok: boolean; error?: string; retryable?: boolean }>;
        unprocessed?: string[];
      };

      // Posten är skriven — nyckeln behövs inte längre.
      for (const r of data.results) {
        if (r.ok) attemptsRef.current.delete(r.key);
      }

      // En post som fallerat på något som kan gå över läggs tillbaka i stället
      // för att kastas. Det är hela poängen med idempotensnyckeln: servern slår
      // upp den och svarar "redan gjort" om skrivningen ändå gick igenom, så
      // ett omförsök kan aldrig ge ett andra samtal på bolaget.
      //
      // Fram till 2026-09-04 kastades varje post som fallit på serverfel. En
      // transaktion som timade ut under belastning såg då likadan ut som ett
      // nekat lead: samtalet var borta och säljaren fick trycka om för hand.
      const retry: QueuedDisposition[] = [];
      const giveUp: FailedDisposition[] = [];

      for (const r of data.results) {
        if (r.ok) continue;
        const item = batch.find((b) => b.idempotencyKey === r.key);
        const companyName = item?.companyName ?? "Okänt lead";

        if (!item || r.retryable !== true) {
          attemptsRef.current.delete(r.key);
          giveUp.push({ companyName, error: r.error ?? "Okänt fel" });
          continue;
        }

        const n = (attemptsRef.current.get(r.key) ?? 0) + 1;
        if (n >= MAX_SERVERFORSOK) {
          attemptsRef.current.delete(r.key);
          giveUp.push({ companyName, error: r.error ?? "Okänt fel" });
        } else {
          attemptsRef.current.set(r.key, n);
          retry.push(item);
        }
      }

      // Poster servern inte hann börja på. De har inte fallerat — de stod bara
      // sist i ett block som slog i tidsbudgeten. Tillbaka först i kön, utan
      // att räkna ett försök och utan backoff: nästa anrop tar dem direkt.
      const skipped = data.unprocessed?.length
        ? batch.filter((b) => data.unprocessed!.includes(b.idempotencyKey))
        : [];

      if (retry.length > 0) {
        queueRef.current.unshift(...retry, ...skipped);
        consecutiveFailuresRef.current += 1;
        nextFlushAtRef.current = Date.now() + backoffMs(consecutiveFailuresRef.current);
      } else {
        queueRef.current.unshift(...skipped);
        consecutiveFailuresRef.current = 0;
        // Tömningen fortsätter direkt i stället för att vänta ut nästa tick —
        // fem sekunders paus per block hade gjort en lång kö långsam utan skäl.
        if (skipped.length > 0) setTimeout(() => void flushRef.current?.(), 0);
      }

      if (giveUp.length > 0) setFailed((prev) => [...prev, ...giveUp]);
    } catch (err) {
      // Nätverksfel: lägg tillbaka först i kön och försök igen vid nästa tick.
      //
      // Räknas medvetet INTE mot `MAX_SERVERFORSOK`. Ett serverfel kan vara
      // felklassat och måste ha ett tak, men ett nätverksfel är per definition
      // övergående — säljaren sitter på ett tåg, eller wifit tappade. Att ge
      // upp där vore att kasta samtalet just när det går att rädda.
      queueRef.current.unshift(...batch);
      consecutiveFailuresRef.current += 1;
      nextFlushAtRef.current = Date.now() + backoffMs(consecutiveFailuresRef.current);
      void err;
    } finally {
      flushingRef.current = false;
      setPending(queueRef.current.length);
    }
  }, []);

  flushRef.current = flush;

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
