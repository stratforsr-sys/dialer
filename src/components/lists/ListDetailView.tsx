"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Play, Search, X, Users, Phone, Lock, Unlock,
  Building2, CheckCircle2, Clock, MessageSquare,
} from "lucide-react";
import type { ListDetail } from "@/app/actions/lists";
import { releaseLead } from "@/app/actions/lists";
import { claimState, CLAIM_TTL_DAYS } from "@/lib/claim";
import { deckState, deckStateLabel, isOutOfRotation } from "@/lib/deck-state";
import { FRAMEWORK_STEPS } from "@/lib/cockpit-flow";
import { ShareListModal } from "./ShareListModal";

type UserOption = { id: string; name: string; email: string; role: string };
type Lead = ListDetail["leads"][number];

/**
 * `ringbar` och `ur_rotation` är inte ägarskap som de tre andra — de svarar på
 * om däcket över huvud taget skulle dela ut bolaget. Ett spärrat bolag och ett
 * bolag med öppet löfte såg tidigare ut precis som ett obearbetat lead här, och
 * gick att öppna rakt in i dialern därifrån. Se `lib/deck-state.ts`.
 */
type Filter = "all" | "free" | "mine" | "taken" | "ringbar" | "ur_rotation";

function relativeDays(date: Date | string): string {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return "idag";
  if (days === 1) return "igår";
  return `${days} dgr sedan`;
}

export function ListDetailView({
  list,
  users,
  isAdmin,
  viewerId,
}: {
  list: ListDetail;
  users: UserOption[];
  isAdmin: boolean;
  viewerId: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showShare, setShowShare] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Claim-status räknas ut en gång per render — samma "nu" för alla rader
  const withState = useMemo(() => {
    const now = new Date();
    return list.leads.map((lead) => ({
      lead,
      claim: claimState(lead, viewerId, now),
      deck: deckState(lead, list.maxAttempts, now),
    }));
  }, [list.leads, list.maxAttempts, viewerId]);

  const counts = useMemo(() => {
    let free = 0, mine = 0, taken = 0, ringbar = 0, urRotation = 0;
    for (const { claim, deck } of withState) {
      if (claim.state === "free") free++;
      else if (claim.state === "mine") mine++;
      else taken++;
      if (deck.state === "callable") ringbar++;
      if (isOutOfRotation(deck)) urRotation++;
    }
    return { free, mine, taken, ringbar, urRotation, total: withState.length };
  }, [withState]);

  const rows = useMemo(() => {
    let out = withState;
    if (filter === "ringbar") out = out.filter(({ deck }) => deck.state === "callable");
    else if (filter === "ur_rotation") out = out.filter(({ deck }) => isOutOfRotation(deck));
    else if (filter !== "all") out = out.filter(({ claim }) => claim.state === filter);
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(({ lead }) =>
        lead.companyName.toLowerCase().includes(q) ||
        (lead.orgNumber ?? "").includes(q) ||
        lead.contacts.some((c) => c.name.toLowerCase().includes(q))
      );
    }
    return out;
  }, [withState, filter, search]);

  function handleRelease(leadId: string) {
    startTransition(async () => {
      try {
        await releaseLead(leadId);
        router.refresh();
      } catch {
        // fel visas via oförändrat läge — leadet står kvar som taget
      }
    });
  }

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "Alla", count: counts.total },
    { key: "ringbar", label: "Ringbara", count: counts.ringbar },
    { key: "free", label: "Lediga", count: counts.free },
    { key: "mine", label: "Mina", count: counts.mine },
    { key: "taken", label: "Tagna", count: counts.taken },
    { key: "ur_rotation", label: "Ur rotationen", count: counts.urRotation },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* ── Header ── */}
      <div className="px-8 pt-6 pb-5" style={{ borderBottom: "1px solid var(--border)" }}>
        <Link
          href="/lists"
          className="inline-flex items-center gap-1.5 text-[12px] mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          <ArrowLeft size={13} />
          Alla ringlistor
        </Link>

        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight truncate" style={{ color: "var(--text)" }}>
              {list.name}
            </h1>
            {/* "Ringbara" först, inte "lediga". Ledig svarar på om någon annan
                håller bolaget; ringbar svarar på om däcket skulle dela ut det
                alls — och det är den siffran som säger hur mycket arbete som
                faktiskt finns kvar i mappen. Skillnaden var 831 bolag i
                Clicknet Lista 1 den 26 augusti 2026. */}
            <p className="text-[13px] mt-1" style={{ color: "var(--text-muted)" }}>
              {counts.total.toLocaleString("sv-SE")} leads ·{" "}
              <span style={{ color: "var(--accent)" }}>{counts.ringbar.toLocaleString("sv-SE")} ringbara</span>
              {counts.urRotation > 0 && ` · ${counts.urRotation.toLocaleString("sv-SE")} ur rotationen`}
              {counts.mine > 0 && ` · ${counts.mine} dina`}
              {list.sourceFile ? ` · ${list.sourceFile}` : ""}
            </p>

            {/* Eget manus. Säljaren ska veta att öppningen hen möter i
                cockpiten hör till just den här mappen och inte är husets
                allmänna — annars läser den som en avvikelse att rätta till.
                Admin får dessutom vägen till redigeraren härifrån; utan raden
                är kopplingen mellan mapp och manus bara synlig inne i
                manusvyn. */}
            {list.scripts.length > 0 && (
              <p className="flex items-center gap-1.5 text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                <MessageSquare size={12} style={{ color: "var(--accent)" }} />
                Eget manus:{" "}
                {list.scripts
                  .map((s) => FRAMEWORK_STEPS.find((f) => f.value === s.step)?.label ?? s.step)
                  .join(", ")}
                {isAdmin && (
                  <Link href="/admin/scripts" className="underline underline-offset-2" style={{ color: "var(--text-muted)" }}>
                    ändra
                  </Link>
                )}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <button
                onClick={() => setShowShare(true)}
                className="flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium rounded-md"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-secondary)",
                }}
              >
                <Users size={14} />
                Åtkomst ({list.members.length})
              </button>
            )}
            <button
              onClick={() => router.push(`/cockpit?listId=${list.id}`)}
              disabled={counts.ringbar === 0}
              className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold rounded-md"
              style={{
                background: "var(--accent)",
                color: "var(--bg)",
                opacity: counts.ringbar === 0 ? 0.4 : 1,
                cursor: counts.ringbar === 0 ? "not-allowed" : "pointer",
              }}
            >
              <Play size={13} fill="currentColor" />
              Starta dialer
            </button>
          </div>
        </div>

        {/* Sök + filter */}
        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <div className="relative flex-1 min-w-0 max-w-xs">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--text-dim)" }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök bolag, org-nr, kontakt…"
              className="w-full pl-9 pr-8 py-2 text-[13px] rounded-md focus:outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-dim)" }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium"
                style={{
                  background: filter === f.key ? "var(--surface)" : undefined,
                  border: `1px solid ${filter === f.key ? "var(--border-strong)" : "transparent"}`,
                  color: filter === f.key ? "var(--text)" : "var(--text-muted)",
                }}
              >
                {f.label}
                <span className="ml-1.5 tabular-nums" style={{ color: "var(--text-dim)" }}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tabell ── */}
      <div className="flex-1 overflow-y-auto" style={{ opacity: isPending ? 0.6 : 1 }}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              {counts.total === 0 ? "Mappen är tom" : "Inga leads matchar filtret"}
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <tr style={{ background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
                {["Bolag", "Kontakt", "Senaste samtal", "Status", ""].map((h, i) => (
                  <th
                    key={h + i}
                    className="text-left px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-dim)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lead, claim, deck }) => {
                const contact = lead.contacts[0];
                const lastCall = lead.activities[0];
                const deckLabel = deckStateLabel(deck);
                const outOfRotation = isOutOfRotation(deck);

                return (
                  <tr
                    key={lead.id}
                    className="group"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="flex items-center gap-2.5 min-w-0 hover:underline"
                        style={{ color: "var(--text)" }}
                      >
                        <div
                          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}
                        >
                          <Building2 size={13} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium truncate">{lead.companyName}</p>
                          {/* Varför däcket inte delar ut bolaget. Utan den här
                              raden såg ett spärrat bolag, en kund och ett bolag
                              med öppet löfte likadana ut som ett obearbetat
                              lead — och gick att öppna rakt in i dialern
                              härifrån, eftersom `leaseSpecificLead` med flit
                              struntar i däckets filter. */}
                          {deckLabel ? (
                            <p
                              className="text-[11px] truncate"
                              style={{ color: outOfRotation ? "var(--danger)" : "var(--text-dim)" }}
                            >
                              {deckLabel}
                              {deck.state === "resting" &&
                                ` till ${deck.until.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`}
                              {deck.state === "callback" &&
                                ` ${deck.at.toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`}
                            </p>
                          ) : (
                            lead.orgNumber && (
                              <p
                                className="text-[11px] truncate"
                                style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                              >
                                {lead.orgNumber}
                              </p>
                            )
                          )}
                        </div>
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      {contact ? (
                        <div className="min-w-0">
                          <p className="text-[13px] truncate" style={{ color: "var(--text-secondary)" }}>
                            {contact.name}
                          </p>
                          {contact.directPhone && (
                            <p
                              className="text-[11px]"
                              style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)" }}
                            >
                              {contact.directPhone}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px]" style={{ color: "var(--text-dim)" }}>
                          Ingen kontakt
                        </span>
                      )}
                      {lead._count.contacts > 1 && (
                        <span className="text-[10px]" style={{ color: "var(--text-dim)" }}>
                          +{lead._count.contacts - 1} till
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {lastCall ? relativeDays(lastCall.timestamp) : "—"}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      {claim.state === "free" && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                          style={{ background: "var(--accent-muted)", color: "var(--accent)" }}
                        >
                          <Unlock size={10} />
                          Ledig
                        </span>
                      )}
                      {claim.state === "mine" && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                          style={{ background: "var(--success-bg)", color: "var(--success)" }}
                          title={`Ditt lås gäller till ${claim.expiresAt.toLocaleDateString("sv-SE")}`}
                        >
                          <CheckCircle2 size={10} />
                          Din
                        </span>
                      )}
                      {claim.state === "taken" && (
                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full text-[10px] font-semibold"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}
                          title={`Frigörs ${claim.expiresAt.toLocaleDateString("sv-SE")} (${CLAIM_TTL_DAYS} dgr efter senaste claim)`}
                        >
                          <Lock size={10} />
                          {claim.by.name}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {(claim.state === "mine" || (isAdmin && claim.state === "taken")) && (
                          <button
                            onClick={() => handleRelease(lead.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-medium"
                            style={{
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              color: "var(--text-muted)",
                            }}
                            title="Släpp tillbaka till poolen"
                          >
                            <Unlock size={10} />
                            Släpp
                          </button>
                        )}
                        {claim.state !== "taken" && (
                          <button
                            onClick={() => router.push(`/cockpit?listId=${list.id}&leadId=${lead.id}`)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[11px] font-semibold"
                            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
                          >
                            <Phone size={10} />
                            Ring
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Fotnot om låsregeln */}
      <div
        className="px-8 py-2.5 flex items-center gap-2 shrink-0"
        style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <Clock size={12} style={{ color: "var(--text-dim)" }} />
        <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
          Ett lead låses till den som ringer först och blir automatiskt fritt igen{" "}
          {CLAIM_TTL_DAYS} dagar efter senaste claim.
        </p>
      </div>

      {showShare && (
        <ShareListModal
          listId={list.id}
          listName={list.name}
          users={users}
          currentMemberIds={list.members.map((m) => m.id)}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
