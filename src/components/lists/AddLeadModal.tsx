"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { X, Users, Lock, Check, PhoneOutgoing, ArrowRight, Plus, Building2 } from "lucide-react";
import { createLead, type NyttLeadSvar } from "@/app/actions/leads";
import { toE164, formatSwedish, isSwedishMobile } from "@/lib/phone";
import { orgNyckel } from "@/lib/lead-identitet";

type ListOption = { id: string; name: string };
type Mal = "list" | "mine";

/**
 * Valet säljaren gjorde förra gången. En säljare som jobbar i en kampanj delar
 * allt dit; en som samlar egna tips behåller allt — rutan ska öppna i den
 * vanan. Bara en bekvämlighet: utan lagring öppnar den på "Dela till alla".
 */
const MINNE = "dialer.addLead.target";

function lasMinne(): { mal: Mal; listId: string | null } {
  try {
    const raw = localStorage.getItem(MINNE);
    if (raw) {
      const v = JSON.parse(raw);
      if (v?.mal === "list" || v?.mal === "mine") return { mal: v.mal, listId: v.listId ?? null };
    }
  } catch {}
  return { mal: "list", listId: null };
}

const TOM = {
  companyName: "", orgNumber: "", website: "", city: "", address: "", industry: "",
  name: "", role: "", directPhone: "", switchboard: "", email: "", linkedin: "",
  note: "",
};

/**
 * Lägg till ett bolag för hand.
 *
 * Det enda beslutet utöver uppgifterna är VART bolaget ska: en ringlista
 * ("Dela till alla" — alla med listan kan ringa det) eller säljarens egen mapp
 * ("Behåll till mig"). Raden ovanför knapparna säger utfallet i klartext innan
 * man trycker, så att valet aldrig är en gissning.
 */
export function AddLeadModal({
  lists,
  onClose,
}: {
  /** Ringlistor att dela till — redan filtrerade på åtkomst, utan egna mappar. */
  lists: ListOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [f, setF] = useState(TOM);
  const [mal, setMal] = useState<Mal>("list");
  const [listId, setListId] = useState<string>(lists[0]?.id ?? "");
  const [svar, setSvar] = useState<NyttLeadSvar | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const m = lasMinne();
    // Utan ringlistor finns bara ett val.
    setMal(lists.length === 0 ? "mine" : m.mal);
    if (m.listId && lists.some((l) => l.id === m.listId)) setListId(m.listId);
    firstRef.current?.focus();
  }, [lists]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set = (k: keyof typeof TOM) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setF((p) => ({ ...p, [k]: e.target.value }));

  const direkt = useMemo(() => toE164(f.directPhone), [f.directPhone]);
  const vaxel = useMemo(() => toE164(f.switchboard), [f.switchboard]);
  const org = useMemo(() => orgNyckel(f.orgNumber), [f.orgNumber]);
  const valdLista = lists.find((l) => l.id === listId) ?? null;

  const saknas =
    !f.companyName.trim() ? "Bolagets namn" :
    !direkt && !vaxel ? "Ett nummer som går att ringa" :
    (f.directPhone.trim() && !direkt) || (f.switchboard.trim() && !vaxel) ? "Ett nummer som går att läsa" :
    f.orgNumber.trim() && !org ? "Org.nr med tio siffror" :
    mal === "list" && !valdLista ? "En ringlista" :
    null;

  function spara() {
    if (saknas || isPending) return;
    try { localStorage.setItem(MINNE, JSON.stringify({ mal, listId })); } catch {}
    startTransition(async () => {
      const res = await createLead({
        companyName: f.companyName,
        orgNumber: f.orgNumber,
        website: f.website,
        city: f.city,
        address: f.address,
        industry: f.industry,
        contact: {
          name: f.name, role: f.role, directPhone: f.directPhone,
          switchboard: f.switchboard, email: f.email, linkedin: f.linkedin,
        },
        note: f.note,
        target: mal === "mine" ? { kind: "mine" } : { kind: "list", listId },
      });
      setSvar(res);
      if (res.ok) router.refresh();
    });
  }

  function enTill() {
    setF(TOM);
    setSvar(null);
    setTimeout(() => firstRef.current?.focus(), 0);
  }

  return (
    <div className="overlay flex items-center justify-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal w-full max-w-[640px] mx-4 max-h-[calc(100vh-48px)] flex flex-col overflow-hidden"
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) spara(); }}
      >
        {/* ── Rubrik ── */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "var(--surface-inset)", color: "var(--text-secondary)" }}>
            <Building2 size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>Nytt lead</h3>
            <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              Ett tips, en kund som ringde in, ett bolag du hittat själv
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost btn-sm" aria-label="Stäng"><X size={15} /></button>
        </div>

        {svar?.ok ? (
          <Klart
            namn={f.companyName.trim()}
            svar={svar}
            onEnTill={enTill}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
              {/* ── Bolaget ── */}
              <Sektion rubrik="Bolaget">
                <Falt label="Namn" krav span={2}>
                  <input ref={firstRef} value={f.companyName} onChange={set("companyName")} placeholder="Bygg & Måleri i Lund AB" className={FALT} />
                </Falt>
                <Falt label="Org.nr" ekot={org ? `${org.slice(0, 6)}-${org.slice(6)}` : f.orgNumber.trim() ? "behöver tio siffror" : null} fel={!!f.orgNumber.trim() && !org}>
                  <input value={f.orgNumber} onChange={set("orgNumber")} placeholder="556123-4567" className={`${FALT} font-mono`} inputMode="numeric" />
                </Falt>
                <Falt label="Bransch">
                  <input value={f.industry} onChange={set("industry")} placeholder="Måleri" className={FALT} />
                </Falt>
                <Falt label="Ort">
                  <input value={f.city} onChange={set("city")} placeholder="Lund" className={FALT} />
                </Falt>
                <Falt label="Adress">
                  <input value={f.address} onChange={set("address")} placeholder="Storgatan 1" className={FALT} />
                </Falt>
                <Falt label="Webbplats" span={2}>
                  <input value={f.website} onChange={set("website")} placeholder="byggmaleri.se" className={FALT} />
                </Falt>
              </Sektion>

              {/* ── Kontakten ── */}
              <Sektion rubrik="Kontakt" not="Minst ett nummer — annars går bolaget inte att ringa">
                <Falt label="Namn">
                  <input value={f.name} onChange={set("name")} placeholder="Anna Svensson" className={FALT} />
                </Falt>
                <Falt label="Roll">
                  <input value={f.role} onChange={set("role")} placeholder="VD" className={FALT} />
                </Falt>
                <Falt label="Direktnummer" ekot={nummerEko(f.directPhone, direkt)} fel={!!f.directPhone.trim() && !direkt}>
                  <input value={f.directPhone} onChange={set("directPhone")} placeholder="070-123 45 67" className={`${FALT} font-mono`} inputMode="tel" />
                </Falt>
                <Falt label="Växel" ekot={nummerEko(f.switchboard, vaxel)} fel={!!f.switchboard.trim() && !vaxel}>
                  <input value={f.switchboard} onChange={set("switchboard")} placeholder="046-12 34 56" className={`${FALT} font-mono`} inputMode="tel" />
                </Falt>
                <Falt label="E-post">
                  <input value={f.email} onChange={set("email")} placeholder="anna@byggmaleri.se" className={FALT} type="email" />
                </Falt>
                <Falt label="LinkedIn">
                  <input value={f.linkedin} onChange={set("linkedin")} placeholder="linkedin.com/in/…" className={FALT} />
                </Falt>
                <Falt label="Anteckning" span={2}>
                  <textarea value={f.note} onChange={set("note")} rows={2} placeholder="Tips från Kalle på Lunds Bygg — vill ha hemsida före våren" className={`${FALT} resize-none`} />
                </Falt>
              </Sektion>

              {/* ── Vart ── */}
              <Sektion rubrik="Vart ska bolaget?">
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <Val
                    aktiv={mal === "list"}
                    disabled={lists.length === 0}
                    onClick={() => setMal("list")}
                    ikon={<Users size={14} />}
                    rubrik="Dela till alla"
                    text={lists.length === 0 ? "Du har inga ringlistor att dela till" : "Läggs i en ringlista — alla som har listan kan ringa det"}
                  />
                  <Val
                    aktiv={mal === "mine"}
                    onClick={() => setMal("mine")}
                    ikon={<Lock size={14} />}
                    rubrik="Behåll till mig"
                    text="Läggs i Mina leads — bara du ser det"
                  />
                </div>
                {mal === "list" && lists.length > 0 && (
                  <Falt label="Ringlista" span={2}>
                    <select value={listId} onChange={(e) => setListId(e.target.value)} className={FALT}>
                      {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </Falt>
                )}
              </Sektion>

              {svar && !svar.ok && <Avvisat svar={svar} />}
            </div>

            {/* ── Fot: utfallet i klartext innan man trycker ── */}
            <div className="flex items-center justify-between gap-3 px-5 py-3.5 shrink-0" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-inset)" }}>
              <p className="text-[12px] min-w-0 truncate" style={{ color: "var(--text-muted)" }}>
                {saknas ? (
                  <>Saknas: <span style={{ color: "var(--text-secondary)" }}>{saknas}</span></>
                ) : mal === "mine" ? (
                  <>Hamnar i <strong style={{ color: "var(--text)" }}>Mina leads</strong> · bara du</>
                ) : (
                  <>Hamnar i <strong style={{ color: "var(--text)" }}>{valdLista?.name}</strong> · alla med listan kan ringa det</>
                )}
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={onClose} className="btn-ghost">Avbryt</button>
                <button onClick={spara} disabled={!!saknas || isPending} className="btn-primary" title="⌘ Enter">
                  {isPending ? "Sparar…" : "Lägg till"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const FALT = "w-full px-3 py-2 text-[13px]";

/** Numret som det kommer att ringas — eller beskedet att det inte går. */
function nummerEko(raw: string, e164: string | null): string | null {
  if (!raw.trim()) return null;
  if (!e164) return "går inte att läsa";
  return `${formatSwedish(e164)}${isSwedishMobile(e164) ? " · mobil" : ""}`;
}

function Sektion({ rubrik, not, children }: { rubrik: string; not?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-dim)" }}>{rubrik}</h4>
        {not && <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>{not}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">{children}</div>
    </section>
  );
}

function Falt({
  label, krav, span, ekot, fel, children,
}: {
  label: string;
  krav?: boolean;
  span?: 2;
  /** Raden under fältet: hur värdet tolkades. */
  ekot?: string | null;
  fel?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 min-w-0 ${span === 2 ? "col-span-2" : ""}`}>
      <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}{krav && <span style={{ color: "var(--text-dim)" }}> *</span>}
      </span>
      {children}
      {ekot && (
        <span className="flex items-center gap-1 text-[11px] font-mono tabular-nums" style={{ color: fel ? "var(--danger)" : "var(--text-muted)" }}>
          {!fel && <Check size={10} style={{ color: "var(--success)" }} />}
          {ekot}
        </span>
      )}
    </label>
  );
}

function Val({
  aktiv, disabled, onClick, ikon, rubrik, text,
}: {
  aktiv: boolean;
  disabled?: boolean;
  onClick: () => void;
  ikon: React.ReactNode;
  rubrik: string;
  text: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={aktiv}
      disabled={disabled}
      onClick={onClick}
      className="flex items-start gap-2.5 p-3 rounded-md text-left transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
      style={{
        background: aktiv ? "var(--surface)" : "transparent",
        border: `1px solid ${aktiv ? "var(--accent)" : "var(--border-strong)"}`,
        boxShadow: aktiv ? "0 0 0 3px var(--accent-ring)" : undefined,
      }}
    >
      <span className="mt-[1px] shrink-0" style={{ color: aktiv ? "var(--accent)" : "var(--text-muted)" }}>{ikon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold" style={{ color: "var(--text)" }}>{rubrik}</span>
        <span className="block text-[11px] mt-0.5 leading-snug" style={{ color: "var(--text-muted)" }}>{text}</span>
      </span>
    </button>
  );
}

function Avvisat({ svar }: { svar: Extract<NyttLeadSvar, { ok: false }> }) {
  return (
    <div className="panel-inset px-3.5 py-3 text-[12px]" style={{ borderColor: "var(--danger-border)", color: "var(--text-secondary)" }}>
      {"fel" in svar ? (
        <span style={{ color: "var(--danger)" }}>{svar.fel}</span>
      ) : (
        <span className="flex items-center gap-2 flex-wrap">
          <span>
            <strong style={{ color: "var(--text)" }}>{svar.finns.companyName}</strong> finns redan
            {svar.finns.listName ? <> i <strong style={{ color: "var(--text)" }}>{svar.finns.listName}</strong></> : " i dialern, i en lista du inte har"}
            . Inget nytt skapades.
          </span>
          {svar.finns.leadId && (
            <Link href={`/leads/${svar.finns.leadId}`} className="inline-flex items-center gap-1 font-medium" style={{ color: "var(--accent)" }}>
              Öppna bolaget <ArrowRight size={11} />
            </Link>
          )}
        </span>
      )}
    </div>
  );
}

/** Efter sparandet: nästa steg är att ringa, inte att leta upp bolaget. */
function Klart({
  namn, svar, onEnTill, onClose,
}: {
  namn: string;
  svar: Extract<NyttLeadSvar, { ok: true }>;
  onEnTill: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  return (
    <div className="px-5 py-8 flex flex-col items-center text-center gap-4">
      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "var(--success-bg)", color: "var(--success)" }}>
        <Check size={18} strokeWidth={2.5} />
      </div>
      <div>
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>{namn} är tillagt</p>
        <p className="text-[12px] mt-1" style={{ color: "var(--text-muted)" }}>
          {svar.personal
            ? "Ligger i Mina leads. Bara du ser det — dela det från bolagssidan när det ska ut."
            : <>Ligger i <strong style={{ color: "var(--text-secondary)" }}>{svar.listName}</strong> bland de aldrig ringda — eller ring det själv nu.</>}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <button
          onClick={() => router.push(`/cockpit?listId=${svar.listId}&leadId=${svar.leadId}`)}
          className="btn-primary"
        >
          <PhoneOutgoing size={13} /> Ring nu
        </button>
        <Link href={`/leads/${svar.leadId}`} className="btn-secondary" onClick={onClose}>Öppna bolaget</Link>
        <button onClick={onEnTill} className="btn-ghost"><Plus size={13} /> Lägg till ett till</button>
      </div>
    </div>
  );
}
