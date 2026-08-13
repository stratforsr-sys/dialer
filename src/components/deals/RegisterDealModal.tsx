"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Handshake } from "lucide-react";
import { createDeal } from "@/app/actions/deals";

/**
 * Rutan som gör ett samtal till en affär.
 *
 * Den öppnas direkt när säljaren dispositionerar "Såld" och är det enda som
 * står mellan avslutet och nästa samtal. Därför är den kort. Varje fält som
 * inte behövs för att någon annan ska kunna ta över kunden är ett fält som
 * kostar samtal, och den gamla rutan hade fem sådana: pipeline-steg,
 * sannolikhetsreglage, förväntat avslutsdatum, produktrader och en
 * weighted-summa som ingen läste.
 *
 * Två fält är obligatoriska: vem som sa ja och vad de betalar. Resten är
 * frivilligt — en säljare som inte fick e-postadressen ska inte behöva hitta
 * på en för att kunna bokföra sitt sälj.
 */

interface Props {
  leadId: string;
  companyName: string;
  /** Förifylls från kontakten säljaren hade i luren. */
  defaultContactName?: string | null;
  defaultContactEmail?: string | null;
  defaultContactPhone?: string | null;
  onClose: () => void;
  onCreated: () => void;
}

export function RegisterDealModal({
  leadId,
  companyName,
  defaultContactName,
  defaultContactEmail,
  defaultContactPhone,
  onClose,
  onCreated,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [contactName, setContactName] = useState(defaultContactName ?? "");
  const [contactEmail, setContactEmail] = useState(defaultContactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(defaultContactPhone ?? "");
  const [valueType, setValueType] = useState<"ONE_TIME" | "MONTHLY">("ONE_TIME");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  // Fokus i beloppsfältet och inte i namnfältet: namnet är förifyllt från
  // kontakten, beloppet är det enda säljaren säkert måste skriva.
  const amountRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    amountRef.current?.focus();
  }, []);

  // Escape stänger. Cockpiten lyssnar också på tangenter — den lyssnaren
  // ignorerar input och textarea, men knappar och radioval är inte det, så
  // stoppa allt som händer inuti rutan från att nå den.
  function onKeyDown(e: React.KeyboardEvent) {
    e.stopPropagation();
    if (e.key === "Escape") onClose();
  }

  const parsedAmount = parseFloat(amount.replace(/\s/g, "").replace(",", ".")) || null;
  const canSubmit = contactName.trim().length > 0 && parsedAmount !== null && parsedAmount > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");

    startTransition(async () => {
      try {
        await createDeal({
          leadId,
          title: companyName,
          contactName,
          contactEmail,
          contactPhone,
          valueType,
          value: parsedAmount,
          notes,
        });
        onCreated();
      } catch (err) {
        // Rutan får aldrig stänga sig på ett fel — då är säljet borta och
        // säljaren står redan på nästa bolag utan att veta om det.
        setError(err instanceof Error ? err.message : "Kunde inte spara affären");
      }
    });
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--surface-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--r-md)",
    padding: "9px 12px",
    color: "var(--text)",
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  const labelClass = "block text-[11px] font-semibold uppercase tracking-widest mb-1.5";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={onKeyDown}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[460px] overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-3)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          <div
            className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)" }}
              >
                <Handshake size={14} style={{ color: "var(--success)" }} />
              </span>
              <div className="min-w-0">
                <h2
                  className="text-[16px] font-semibold"
                  style={{ fontFamily: "var(--font-display)", color: "var(--text)" }}
                >
                  Ny affär
                </h2>
                <p className="text-[12px] mt-[1px] truncate" style={{ color: "var(--text-muted)" }}>
                  {companyName}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-sm shrink-0"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
              title="Avbryt"
            >
              <X size={13} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                Kontaktperson *
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                placeholder="Vem sa ja?"
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                  E-post
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                  Telefon
                </label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                Ordervärde *
              </label>
              <div className="flex gap-2">
                <div
                  className="flex rounded-md overflow-hidden border shrink-0"
                  style={{ borderColor: "var(--border-strong)" }}
                >
                  {([
                    { id: "ONE_TIME", label: "Engång" },
                    { id: "MONTHLY", label: "Per månad" },
                  ] as const).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setValueType(t.id)}
                      className="px-3 py-2 text-[11px] font-semibold transition-colors"
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
                  ref={amountRef}
                  type="text"
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  required
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", textAlign: "right" }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
                <span
                  className="flex items-center text-[12px] px-1 shrink-0"
                  style={{ color: "var(--text-muted)" }}
                >
                  kr
                </span>
              </div>
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>
                Anteckning
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Vad kom ni överens om? Vad ska den som tar över veta?"
                style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>

            {error && (
              <p
                className="text-[12px] px-3 py-2 rounded-md"
                style={{ background: "var(--danger-bg)", color: "var(--danger)", border: "1px solid var(--danger-border)" }}
              >
                {error}
              </p>
            )}

            <div
              className="flex items-center justify-end gap-2 pt-2 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-[13px] font-medium rounded-md"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-muted)",
                }}
              >
                Avbryt
              </button>
              <button
                type="submit"
                disabled={isPending || !canSubmit}
                className="px-5 py-2 text-[13px] font-semibold rounded-md transition-opacity"
                style={{
                  background: "var(--accent)",
                  color: "var(--on-accent)",
                  opacity: isPending || !canSubmit ? 0.5 : 1,
                  boxShadow: "var(--shadow-1)",
                }}
              >
                {isPending ? "Sparar..." : "Registrera affär"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
