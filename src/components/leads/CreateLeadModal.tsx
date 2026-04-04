"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { X, Plus, Trash2 } from "lucide-react";
import { createLead } from "@/app/actions/leads";

type ContactRow = {
  name: string;
  role: string;
  directPhone: string;
  email: string;
};

export function CreateLeadModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [company, setCompany] = useState("");
  const [orgNumber, setOrgNumber] = useState("");
  const [website, setWebsite] = useState("");
  const [contacts, setContacts] = useState<ContactRow[]>([
    { name: "", role: "", directPhone: "", email: "" },
  ]);

  function addContact() {
    setContacts((c) => [...c, { name: "", role: "", directPhone: "", email: "" }]);
  }

  function removeContact(i: number) {
    setContacts((c) => c.filter((_, idx) => idx !== i));
  }

  function updateContact(i: number, field: keyof ContactRow, value: string) {
    setContacts((c) =>
      c.map((row, idx) => (idx === i ? { ...row, [field]: value } : row))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!company.trim()) return;
    setError("");

    startTransition(async () => {
      try {
        const validContacts = contacts.filter((c) => c.name.trim());
        const lead = await createLead({
          companyName: company.trim(),
          orgNumber: orgNumber.trim() || undefined,
          website: website.trim() || undefined,
          contacts: validContacts.map((c) => ({
            name: c.name.trim(),
            role: c.role.trim() || undefined,
            directPhone: c.directPhone.trim() || undefined,
            email: c.email.trim() || undefined,
          })),
        });
        onClose();
        router.push(`/leads/${lead.id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Något gick fel");
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-[520px] overflow-hidden"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: "18px",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h2
            className="text-[15px] font-semibold"
            style={{ color: "var(--text)" }}
          >
            Nytt lead
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
            style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 flex flex-col gap-4 max-h-[70vh] overflow-y-auto">
            {/* Company */}
            <div className="flex flex-col gap-[6px]">
              <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Bolagsnamn *
              </label>
              <input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Acme AB"
                required
                className="text-[13px] outline-none"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  color: "var(--text)",
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-[6px]">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Org-nummer
                </label>
                <input
                  value={orgNumber}
                  onChange={(e) => setOrgNumber(e.target.value)}
                  placeholder="556123-4567"
                  className="text-[13px] outline-none"
                  style={{
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "var(--text)",
                  }}
                />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Hemsida
                </label>
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="acme.se"
                  className="text-[13px] outline-none"
                  style={{
                    background: "var(--surface-inset)",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    color: "var(--text)",
                  }}
                />
              </div>
            </div>

            {/* Contacts */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Kontakter
                </label>
                <button
                  type="button"
                  onClick={addContact}
                  className="flex items-center gap-1 text-[11px] font-medium"
                  style={{ color: "var(--accent)" }}
                >
                  <Plus size={11} /> Lägg till
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {contacts.map((c, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-[10px] flex flex-col gap-2"
                    style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={c.name}
                        onChange={(e) => updateContact(i, "name", e.target.value)}
                        placeholder="Namn"
                        className="text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
                        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      />
                      <input
                        value={c.role}
                        onChange={(e) => updateContact(i, "role", e.target.value)}
                        placeholder="Roll (VD, etc.)"
                        className="text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
                        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      />
                      <input
                        value={c.directPhone}
                        onChange={(e) => updateContact(i, "directPhone", e.target.value)}
                        placeholder="Telefon"
                        className="text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
                        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      />
                      <input
                        value={c.email}
                        onChange={(e) => updateContact(i, "email", e.target.value)}
                        placeholder="Email"
                        className="text-[12px] outline-none px-2 py-[6px] rounded-[6px]"
                        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                      />
                    </div>
                    {contacts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeContact(i)}
                        className="self-end text-[11px] flex items-center gap-1"
                        style={{ color: "var(--text-dim)" }}
                      >
                        <Trash2 size={10} /> Ta bort
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-[12px] px-3 py-2 rounded-[8px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-2 px-6 py-4 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-[13px] font-medium rounded-[8px] transition-colors"
              style={{ background: "var(--surface-inset)", color: "var(--text-secondary)" }}
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={isPending || !company.trim()}
              className="px-4 py-2 text-[13px] font-medium rounded-[8px] transition-opacity"
              style={{
                background: "var(--accent)",
                color: "white",
                opacity: isPending || !company.trim() ? 0.6 : 1,
              }}
            >
              {isPending ? "Skapar..." : "Skapa lead"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
