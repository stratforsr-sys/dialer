"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Search, Repeat, Undo2 } from "lucide-react";
import { formatDate } from "@/lib/time";
import type { DealRow } from "@/app/actions/deals";

/**
 * Kundregistret.
 *
 * Ersätter kanbanbrädet. Ett bräde med kolumner beskriver arbete som rör sig
 * genom stadier — här finns inga stadier, bara avslut, och då är listan rätt
 * form: sorterad på när affären gjordes, sökbar på bolag och person.
 *
 * Engångsbelopp och månadsbelopp visas som två separata summor och slås aldrig
 * ihop. En krona i månaden och en krona en gång är olika saker.
 */

function money(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 });
}

export function DealsView({ deals, isAdmin }: { deals: DealRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return deals;
    return deals.filter(
      (d) =>
        d.lead.companyName.toLowerCase().includes(q) ||
        (d.contactName ?? "").toLowerCase().includes(q) ||
        (d.lead.city ?? "").toLowerCase().includes(q) ||
        (d.lead.orgNumber ?? "").includes(q)
    );
  }, [deals, query]);

  // Summorna räknas på det som visas, inte på allt. Söker man fram en säljare
  // eller en ort ska talen uppe i hörnet svara på den frågan.
  const won = filtered.filter((d) => d.status === "WON");
  const oneTime = won.filter((d) => d.valueType === "ONE_TIME").reduce((s, d) => s + (d.value ?? 0), 0);
  const monthly = won.filter((d) => d.valueType === "MONTHLY").reduce((s, d) => s + (d.value ?? 0), 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center gap-4 px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1 className="text-[15px] shrink-0" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
          Deals
        </h1>
        <span
          className="text-[12px] px-2 py-[2px] rounded-full font-medium shrink-0"
          style={{ background: "var(--accent-muted)", color: "var(--accent)" }}
        >
          {won.length} {won.length === 1 ? "affär" : "affärer"}
        </span>

        {oneTime > 0 && (
          <span className="text-[12px] shrink-0 mono-nums" style={{ color: "var(--text-muted)" }}>
            {money(oneTime)} kr engång
          </span>
        )}
        {monthly > 0 && (
          <span className="flex items-center gap-1 text-[12px] shrink-0 mono-nums" style={{ color: "var(--text-muted)" }}>
            <Repeat size={11} style={{ color: "var(--text-dim)" }} />
            {money(monthly)} kr/mån
          </span>
        )}

        <div className="flex-1" />

        <div className="relative w-[260px] shrink-0">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-dim)" }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sök bolag, person, ort..."
            className="w-full text-[13px] outline-none"
            style={{
              background: "var(--surface-inset)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-md)",
              padding: "7px 12px 7px 32px",
              color: "var(--text)",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <Handshake size={24} style={{ color: "var(--text-dim)" }} />
            </div>
            <p className="text-[14px]" style={{ color: "var(--text-muted)" }}>
              {query ? "Inga träffar" : "Inga affärer ännu"}
            </p>
            {!query && (
              <p className="text-[12px] text-center max-w-[320px]" style={{ color: "var(--text-dim)" }}>
                En affär skapas när du dispositionerar ett samtal som &quot;Såld&quot; i dialern.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "var(--surface)" }}>
                {[
                  { label: "Bolag", align: "left" as const },
                  { label: "Kontaktperson", align: "left" as const },
                  { label: "Värde", align: "right" as const },
                  ...(isAdmin ? [{ label: "Säljare", align: "left" as const }] : []),
                  { label: "Avslut", align: "left" as const },
                ].map((h) => (
                  <th
                    key={h.label}
                    className="text-[10px] font-bold uppercase tracking-widest px-4 py-[9px] whitespace-nowrap"
                    style={{
                      color: "var(--text-dim)",
                      borderBottom: "1px solid var(--border)",
                      textAlign: h.align,
                    }}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => {
                const cancelled = d.status === "LOST";
                return (
                  <tr
                    key={d.id}
                    onClick={() => router.push(`/deals/${d.id}`)}
                    className="cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border-subtle)", opacity: cancelled ? 0.55 : 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-4 py-[10px]">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[13px] font-medium"
                          style={{ color: "var(--text)", textDecoration: cancelled ? "line-through" : "none" }}
                        >
                          {d.lead.companyName}
                        </span>
                        {cancelled && (
                          <span
                            className="flex items-center gap-1 text-[10px] px-1.5 py-[1px] rounded-full shrink-0"
                            style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
                          >
                            <Undo2 size={9} /> Ångrad
                          </span>
                        )}
                      </div>
                      {(d.lead.city || d.lead.industry) && (
                        <p className="text-[11px] mt-[1px]" style={{ color: "var(--text-dim)" }}>
                          {[d.lead.city, d.lead.industry].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-[10px]">
                      <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {d.contactName ?? "—"}
                      </span>
                      {d.contactEmail && (
                        <p className="text-[11px] mt-[1px] truncate max-w-[220px]" style={{ color: "var(--text-dim)" }}>
                          {d.contactEmail}
                        </p>
                      )}
                    </td>

                    <td className="px-4 py-[10px] text-right whitespace-nowrap">
                      <span className="text-[13px] font-semibold mono-nums" style={{ color: "var(--text)" }}>
                        {d.value != null ? `${money(d.value)} kr` : "—"}
                      </span>
                      {d.valueType === "MONTHLY" && (
                        <p className="flex items-center justify-end gap-1 text-[10px] mt-[1px]" style={{ color: "var(--text-dim)" }}>
                          <Repeat size={9} /> per månad
                        </p>
                      )}
                    </td>

                    {isAdmin && (
                      <td className="px-4 py-[10px] whitespace-nowrap">
                        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                          {d.createdBy.name}
                        </span>
                      </td>
                    )}

                    <td className="px-4 py-[10px] whitespace-nowrap">
                      <span className="text-[12px] mono-nums" style={{ color: "var(--text-muted)" }}>
                        {formatDate(new Date(d.closedAt))}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
