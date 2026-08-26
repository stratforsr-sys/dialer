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
 * Rutan gör exakt två saker: slår upp numret och sparar det.
 *
 * Uppslagningen går till sex ställen, i den ordning de brukar ge svar:
 *
 * | Var | Nyckel | Vad det ger |
 * |---|---|---|
 * | Merinfo | org-nummer | En träff, med nummer när det finns registrerat |
 * | Allabolag | org-nummer | Bolagssidan direkt — ledamotens namn, som ofta är vägen till mobilen |
 * | Hitta.se | namn + ort | Går direkt till bolagssidan när träffen är entydig |
 * | Eniro | namn | Katalogen med flest småbolagsnummer |
 * | BraByggare | namn, via Google | Ingen egen sökning finns — se nedan |
 * | Google | namn | Bolagsrutan och det som ingen katalog har |
 *
 * Registren slås upp på org-numret när det finns: då blir det en träff i
 * stället för en lista. Google söker på enbart bolagsnamnet — numret ligger
 * oftast i bolagsrutan eller en katalogträff, och varje extra ord i frågan är
 * ett ord som kan sålla bort just den träffen.
 *
 * BraByggare är undantaget: sajten har varken sökning på bolagsnamn eller
 * org-nummer, bolagssidorna ligger på interna id:n (`/hantverkare/3343/`), och
 * sidan visar sällan ett telefonnummer. Länken är därför en Google-sökning mot
 * domänen. Den bär ändå bolagets hemsida och omdömen, och hemsidan bär numret.
 *
 * Alla öppnas i en egen flik, aldrig i cockpiten: en navigering här hade delat
 * ringsessionen i två. Formaten är provade i webbläsaren — flera av sajterna
 * svarar 403 på curl, och Eniro ger 404 på allt utom sitt eget sökvägsformat.
 *
 * Sparandet skapar en kontakt med `createContact`, som normaliserar numret till
 * E164; utan det syns numret i kortet men går inte att ringa.
 *
 * Förvalt namn är "Växeln". Det vanliga fyndet på ett litet bolag är
 * företagsnumret, inte en namngiven beslutsfattare, och ett tomt namnfält hade
 * tvingat säljaren att hitta på något innan numret gick att spara.
 */
export function AddNumberCard({
  leadId,
  companyName,
  city,
  orgNumber,
  onAdded,
}: {
  leadId: string;
  companyName: string;
  city?: string | null;
  orgNumber?: string | null;
  onAdded: (contact: NewContact) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Växeln");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org-numret utan bindestreck är den exakta nyckeln hos båda registren och
  // ger en träff i stället för en lista. Saknas det faller båda tillbaka på
  // namnet — sämre, men aldrig en död länk.
  const digits = orgNumber?.replace(/\D/g, "") || null;
  const nameQuery = encodeURIComponent([companyName, city].filter(Boolean).join(" "));

  // Eniro tar sökordet som en del av sökvägen med plus mellan orden, inte som
  // en query-parameter: /boochbygg+p%C3%A5+svedjeudden+ab/företag. Andra
  // format ger 404 — bekräftat i webbläsaren, sajten svarar inte på curl.
  const eniroQuery = encodeURIComponent(companyName.toLowerCase()).replace(/%20/g, "+");

  const lookups = [
    {
      label: "Merinfo",
      href: digits
        ? `https://www.merinfo.se/search?who=${digits}`
        : `https://www.merinfo.se/search?who=${nameQuery}`,
    },
    {
      // Org-numret går rakt in på bolagssidan; utan det är /what/ en sökning.
      label: "Allabolag",
      href: digits
        ? `https://www.allabolag.se/${digits}`
        : `https://www.allabolag.se/what/${encodeURIComponent(companyName)}`,
    },
    {
      // Orten med: Hitta.se går direkt till bolagssidan när träffen är entydig,
      // och orten är det som gör den entydig på vanliga bolagsnamn.
      label: "Hitta.se",
      href: `https://www.hitta.se/sok?vad=${nameQuery}`,
    },
    {
      label: "Eniro",
      href: `https://www.eniro.se/${eniroQuery}/f%C3%B6retag`,
    },
    {
      // BraByggare har varken sökning på bolagsnamn eller org-nummer —
      // bolagssidorna ligger på interna id:n (/hantverkare/3343/). Enda vägen
      // in utifrån är en Google-sökning mot domänen. Sidan visar sällan ett
      // nummer heller, men den bär bolagets hemsida och omdömen, och hemsidan
      // bär numret.
      label: "BraByggare",
      href: `https://www.google.com/search?q=site:brabyggare.se+${encodeURIComponent(companyName)}`,
    },
    {
      // Bara bolagsnamnet, utan ort och utan ordet "telefon". Numret ligger
      // ofta i Googles egen bolagsruta eller i en katalogträff, och varje
      // extra ord i frågan är ett ord som kan sålla bort just den träffen.
      label: "Google",
      href: `https://www.google.com/search?q=${encodeURIComponent(companyName)}`,
    },
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
            kvar på leadet för alla efteråt. Hittar du inget:{" "}
            <span style={{ color: "var(--text-secondary)" }}>
              disposition 5, «Inget telefonnummer»
            </span>{" "}
            raderar bolaget så att ingen gör om samma sökning.
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
