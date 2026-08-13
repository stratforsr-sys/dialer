"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, Mail, Phone, Globe, MapPin, Users, Repeat,
  Pencil, Check, X, Undo2, ExternalLink,
} from "lucide-react";
import { LeadHistory } from "@/components/cockpit/LeadHistory";
import { updateDeal, cancelDeal } from "@/app/actions/deals";
import { formatDate } from "@/lib/time";
import type { DealDetail as DealDetailData } from "@/app/actions/deals";

/**
 * En kund.
 *
 * Sidan svarar på tre frågor, i den ordningen: vem betalar oss och hur mycket,
 * vem pratar vi med, och vad har sagts. Historiken är den tredje och största —
 * `LeadHistory` återanvänds rakt av från cockpiten, för samtalen och
 * anteckningarna ligger fortfarande på leadet. Affären äger dem inte, den
 * pekar bara på samma bolag.
 */

function money(n: number): string {
  return n.toLocaleString("sv-SE", { maximumFractionDigits: 0 });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-[3px]" style={{ color: "var(--text-dim)" }}>
        {label}
      </p>
      <div className="text-[13px]" style={{ color: "var(--text)" }}>{children}</div>
    </div>
  );
}

export function DealDetail({ data }: { data: DealDetailData }) {
  const { deal, lead } = data;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  const [contactName, setContactName] = useState(deal.contactName ?? "");
  const [contactEmail, setContactEmail] = useState(deal.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(deal.contactPhone ?? "");
  const [valueType, setValueType] = useState<"ONE_TIME" | "MONTHLY">(deal.valueType);
  const [amount, setAmount] = useState(deal.value != null ? String(deal.value) : "");
  const [notes, setNotes] = useState(deal.notes ?? "");

  const cancelled = deal.status === "LOST";

  function save() {
    setError("");
    startTransition(async () => {
      try {
        await updateDeal(deal.id, {
          contactName,
          contactEmail,
          contactPhone,
          valueType,
          value: parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || null,
          notes,
        });
        setEditing(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte spara");
      }
    });
  }

  function handleCancel() {
    const reason = window.prompt(
      `Ångra affären med ${lead.companyName}?\n\nAffären ligger kvar i listan som ångrad och bolaget går tillbaka i ringrotationen. Skriv gärna varför:`
    );
    if (reason === null) return;
    startTransition(async () => {
      try {
        await cancelDeal(deal.id, reason);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte ångra affären");
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--r-md)",
    padding: "7px 10px",
    color: "var(--text)",
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  const websiteUrl = lead.website
    ? lead.website.startsWith("http") ? lead.website : `https://${lead.website}`
    : null;

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center gap-3 px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <Link
          href="/deals"
          className="flex items-center justify-center w-7 h-7 rounded-sm shrink-0"
          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
          title="Tillbaka till Deals"
        >
          <ArrowLeft size={14} />
        </Link>

        <h1
          className="text-[15px] truncate"
          style={{ color: "var(--text)", fontFamily: "var(--font-display)", textDecoration: cancelled ? "line-through" : "none" }}
        >
          {lead.companyName}
        </h1>

        {cancelled ? (
          <span
            className="flex items-center gap-1 text-[11px] px-2 py-[2px] rounded-full shrink-0"
            style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
          >
            <Undo2 size={10} /> Ångrad affär
          </span>
        ) : (
          <span
            className="text-[11px] px-2 py-[2px] rounded-full shrink-0 font-medium"
            style={{ background: "var(--success-bg)", color: "var(--success)", border: "1px solid var(--success-border)" }}
          >
            Kund
          </span>
        )}

        <div className="flex-1" />

        {!editing && (
          <>
            <Link
              href={`/leads/${lead.id}`}
              className="flex items-center gap-1.5 text-[12px] px-3 py-[6px] rounded-md shrink-0"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <ExternalLink size={11} /> Leadet
            </Link>
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-[6px] rounded-md shrink-0"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
            >
              <Pencil size={11} /> Redigera
            </button>
          </>
        )}
        {editing && (
          <>
            <button
              onClick={() => { setEditing(false); setError(""); }}
              className="flex items-center gap-1.5 text-[12px] px-3 py-[6px] rounded-md shrink-0"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            >
              <X size={11} /> Avbryt
            </button>
            <button
              onClick={save}
              disabled={isPending}
              className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-[6px] rounded-md shrink-0"
              style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: isPending ? 0.6 : 1, boxShadow: "var(--shadow-1)" }}
            >
              <Check size={11} /> {isPending ? "Sparar..." : "Spara"}
            </button>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[860px] mx-auto p-6 flex flex-col gap-4">
          {error && (
            <p
              className="text-[12px] px-3 py-2 rounded-md"
              style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
            >
              {error}
            </p>
          )}

          {/* Affären */}
          <div className="rounded-lg p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            {editing ? (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-[5px]" style={{ color: "var(--text-dim)" }}>Kontaktperson</p>
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-[5px]" style={{ color: "var(--text-dim)" }}>E-post</p>
                    <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-[5px]" style={{ color: "var(--text-dim)" }}>Telefon</p>
                    <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} />
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-[5px]" style={{ color: "var(--text-dim)" }}>Ordervärde</p>
                  <div className="flex gap-2 max-w-[360px]">
                    <div className="flex rounded-md overflow-hidden border shrink-0" style={{ borderColor: "var(--border-strong)" }}>
                      {([{ id: "ONE_TIME", label: "Engång" }, { id: "MONTHLY", label: "Per månad" }] as const).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setValueType(t.id)}
                          className="px-3 py-[7px] text-[11px] font-semibold"
                          style={{
                            background: valueType === t.id ? "var(--accent)" : "var(--surface-inset)",
                            color: valueType === t.id ? "var(--on-accent)" : "var(--text-muted)",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                    <input
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      inputMode="numeric"
                      style={{ ...inputStyle, fontFamily: "var(--font-mono)", textAlign: "right" }}
                    />
                    <span className="flex items-center text-[12px] shrink-0" style={{ color: "var(--text-muted)" }}>kr</span>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest mb-[5px]" style={{ color: "var(--text-dim)" }}>Anteckning</p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-6 mb-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-dim)" }}>
                      Ordervärde
                    </p>
                    <p className="text-[30px] font-bold leading-none mono-nums" style={{ color: "var(--text)", fontFamily: "var(--font-display)" }}>
                      {deal.value != null ? `${money(deal.value)} kr` : "—"}
                    </p>
                    {deal.valueType === "MONTHLY" && (
                      <p className="flex items-center gap-1 text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>
                        <Repeat size={11} style={{ color: "var(--text-dim)" }} /> per månad
                        {deal.value != null && (
                          <span style={{ color: "var(--text-dim)" }}>· {money(deal.value * 12)} kr per år</span>
                        )}
                      </p>
                    )}
                    {deal.valueType === "ONE_TIME" && (
                      <p className="text-[12px] mt-1.5" style={{ color: "var(--text-muted)" }}>engångsbelopp</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 text-right shrink-0">
                    <Field label="Avslut">
                      <span className="mono-nums">{formatDate(new Date(deal.closedAt))}</span>
                    </Field>
                    <Field label="Såld av">{deal.createdBy.name}</Field>
                  </div>
                </div>

                <div
                  className="grid grid-cols-3 gap-4 pt-4"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <Field label="Kontaktperson">{deal.contactName ?? <span style={{ color: "var(--text-dim)" }}>—</span>}</Field>
                  <Field label="E-post">
                    {deal.contactEmail ? (
                      <a href={`mailto:${deal.contactEmail}`} className="flex items-center gap-1.5 hover:underline" style={{ color: "var(--accent)" }}>
                        <Mail size={12} /> {deal.contactEmail}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    )}
                  </Field>
                  <Field label="Telefon">
                    {deal.contactPhone ? (
                      <a href={`tel:${deal.contactPhone}`} className="flex items-center gap-1.5 hover:underline mono-nums" style={{ color: "var(--accent)" }}>
                        <Phone size={12} /> {deal.contactPhone}
                      </a>
                    ) : (
                      <span style={{ color: "var(--text-dim)" }}>—</span>
                    )}
                  </Field>
                </div>

                {deal.notes && (
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-dim)" }}>
                      Anteckning
                    </p>
                    {/* whitespace-pre-wrap: anteckningar skrivs med radbrytningar
                        och HTML klämmer annars ihop dem till en mening. */}
                    <p className="text-[13px] whitespace-pre-wrap" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      {deal.notes}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Bolaget */}
          <div className="rounded-lg p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={13} style={{ color: "var(--text-dim)" }} />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                Bolaget
              </p>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {lead.orgNumber && (
                <span className="text-[12px] mono-nums" style={{ color: "var(--text-muted)" }}>{lead.orgNumber}</span>
              )}
              {(lead.address || lead.city) && (
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <MapPin size={11} style={{ color: "var(--text-dim)" }} />
                  {[lead.address, lead.city].filter(Boolean).join(", ")}
                </span>
              )}
              {lead.industry && (
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>{lead.industry}</span>
              )}
              {lead.employees !== null && (
                <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <Users size={11} style={{ color: "var(--text-dim)" }} />
                  {lead.employees.toLocaleString("sv-SE")} anställda
                </span>
              )}
              {websiteUrl && (
                <a
                  href={websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12px] hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  <Globe size={11} /> {lead.website}
                </a>
              )}
            </div>
          </div>

          {/* Vad som sagts. Samma komponent som i cockpiten — anteckningarna
              ligger på leadet och ska läsas likadant oavsett var man står. */}
          <LeadHistory attempts={lead.callAttempts} activities={lead.activities} />

          {!cancelled && (
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="flex items-center gap-1.5 self-start text-[12px] px-3 py-[7px] rounded-md"
              style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-dim)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--danger)";
                e.currentTarget.style.borderColor = "var(--danger-border)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-dim)";
                e.currentTarget.style.borderColor = "var(--border)";
              }}
            >
              <Undo2 size={11} /> Ångra affären
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
