"use client";

import { useState } from "react";
import { PhoneOff, Search, Loader2, Plus } from "lucide-react";
import { createContact } from "@/app/actions/contacts";

export type NewContact = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  role: string | null;
  directPhone: string | null;
  switchboard: string | null;
  directPhoneE164: string | null;
  switchboardE164: string | null;
  email: string | null;
  linkedin: string | null;
};

/**
 * Bolaget saknar nummer — hämta det här, i passet.
 *
 * Tidigare delades ett sådant bolag helt enkelt inte ut: `leaseNextLeads`
 * krävde en kontaktrad, och en importfil utan telefonkolumn gav en mapp som
 * cockpiten kallade "slut" trots tusen obearbetade bolag. Bolagen delas nu ut,
 * och då måste det gå att göra något med dem på skärmen där de dyker upp.
 *
 * Rutan gör exakt två saker: slår upp numret och sparar det. Uppslagningen är
 * länkar till Hitta.se och Google med bolagsnamn och ort ifyllt — de öppnas i
 * en egen flik, aldrig i cockpiten, eftersom en navigering här hade delat
 * ringsessionen i två. Sparandet skapar en kontakt med `createContact`, som
 * normaliserar numret till E164; utan det syns numret i kortet men går inte
 * att ringa.
 *
 * Förvalt namn är "Växeln". Det vanliga fyndet på ett litet bolag är
 * företagsnumret, inte en namngiven beslutsfattare, och ett tomt namnfält hade
 * tvingat säljaren att hitta på något innan numret gick att spara.
 */
export function AddNumberCard({
  leadId,
  companyName,
  city,
  onAdded,
}: {
  leadId: string;
  companyName: string;
  city?: string | null;
  onAdded: (contact: NewContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Växeln");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = encodeURIComponent([companyName, city].filter(Boolean).join(" "));
  const lookups = [
    { label: "Hitta.se", href: `https://www.hitta.se/sok?vad=${query}` },
    { label: "Google", href: `https://www.google.com/search?q=${query}+telefon` },
  ];

  async function save() {
    const number = phone.trim();
    if (!number) return;
    setSaving(true);
    setError(null);
    try {
      const contact = await createContact(leadId, {
        name: name.trim() || "Växeln",
        switchboard: number,
      });
      onAdded({
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName,
        lastName: contact.lastName,
        role: contact.role,
        directPhone: contact.directPhone,
        switchboard: contact.switchboard,
        directPhoneE164: contact.directPhoneE164,
        switchboardE164: contact.switchboardE164,
        email: contact.email,
        linkedin: contact.linkedin,
      });
      setPhone("");
      setOpen(false);
    } catch {
      // Numret är inskrivet för hand och får inte försvinna med felet —
      // fältet står kvar ifyllt så att ett nytt försök är ett klick.
      setError("Numret kunde inte sparas. Försök igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg p-5 mb-3"
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
        >
          <PhoneOff size={14} style={{ color: "var(--text-muted)" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Inget nummer i registret
          </p>
          <p className="text-[12px] mt-[2px]" style={{ color: "var(--text-muted)" }}>
            Bolaget kom in utan telefonnummer. Slå upp det och spara — det ligger
            kvar på leadet för alla efteråt.
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {lookups.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-secondary)",
                }}
              >
                <Search size={11} /> {l.label}
              </a>
            ))}
            {!open && (
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                <Plus size={11} strokeWidth={3} /> Lägg till nummer
              </button>
            )}
          </div>

          {open && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Växeln"
                  className="px-3 py-2 text-[13px] rounded-md focus:outline-none w-[150px]"
                  style={{
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                  }}
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => {
                    // Enter sparar. Genvägarna för disposition ligger på window
                    // och grindas på att markören står i ett fält — därför
                    // stoppas tangenten här, annars bokförs ett samtal medan
                    // säljaren skriver ett telefonnummer.
                    e.stopPropagation();
                    if (e.key === "Enter") void save();
                  }}
                  autoFocus
                  inputMode="tel"
                  placeholder="08-123 45 67"
                  className="flex-1 px-3 py-2 text-[13px] rounded-md focus:outline-none"
                  style={{
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !phone.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-semibold"
                  style={{
                    background: "var(--accent)",
                    color: "var(--on-accent)",
                    opacity: saving || !phone.trim() ? 0.5 : 1,
                  }}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : null}
                  Spara
                </button>
              </div>
              {error && (
                <p className="text-[12px]" style={{ color: "var(--danger)" }}>
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
