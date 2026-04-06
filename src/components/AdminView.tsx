"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Layers, Plus, Trash2, Package, ToggleLeft, ToggleRight } from "lucide-react";
import { createUser, deleteUser, updateUserRole } from "@/app/actions/users";
import { createStage, deleteStage, updateStage } from "@/app/actions/pipeline";
import { createProduct, updateProduct, deleteProduct } from "@/app/actions/products";

type UserRow = { id: string; name: string; email: string; role: string; createdAt: Date };
type Stage = { id: string; name: string; color: string; order: number; isDefault: boolean; isWon: boolean; isLost: boolean };
type Product = { id: string; name: string; description: string | null; basePrice: number | null; isRecurring: boolean; unit: string | null; active: boolean };

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <Icon size={15} style={{ color: "var(--text-muted)" }} />
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function AdminView({ users, stages, products }: { users: UserRow[]; stages: Stage[]; products: Product[] }) {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"users" | "pipeline" | "products">("users");
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "SELLER" as "ADMIN" | "SELLER" });
  const [showNewStage, setShowNewStage] = useState(false);
  const [newStage, setNewStage] = useState({ name: "", color: "#6B7280" });
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", description: "", basePrice: "", isRecurring: false, unit: "" });
  const [error, setError] = useState("");

  function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        await createUser(newUser);
        setNewUser({ name: "", email: "", password: "", role: "SELLER" });
        setShowNewUser(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fel");
      }
    });
  }

  function handleCreateStage(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createStage({ name: newStage.name, color: newStage.color, order: stages.length });
        setNewStage({ name: "", color: "#6B7280" });
        setShowNewStage(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fel");
      }
    });
  }

  function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createProduct({
          name: newProduct.name,
          description: newProduct.description || null,
          basePrice: newProduct.basePrice ? parseFloat(newProduct.basePrice) : null,
          isRecurring: newProduct.isRecurring,
          unit: newProduct.unit || null,
        });
        setNewProduct({ name: "", description: "", basePrice: "", isRecurring: false, unit: "" });
        setShowNewProduct(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fel");
      }
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 h-[56px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
        <h1 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Admin</h1>
        <div className="flex gap-1 p-1 rounded-[8px]" style={{ background: "var(--surface-inset)" }}>
          {(["users", "pipeline", "products"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-[5px] text-[12px] font-medium rounded-[6px] transition-colors"
              style={{
                background: tab === t ? "var(--surface)" : "transparent",
                color: tab === t ? "var(--text)" : "var(--text-muted)",
                boxShadow: tab === t ? "var(--shadow-xs)" : "none",
              }}>
              {t === "users" ? "Användare" : t === "pipeline" ? "Pipeline" : "Produkter"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[700px] mx-auto flex flex-col gap-4">

          <AnimatePresence mode="wait">
            {tab === "users" && (
              <motion.div key="users" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Section title={`Användare (${users.length})`} icon={Users}>
                  <div className="flex flex-col gap-2 mb-4">
                    {users.map((u) => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                          style={{ background: "var(--accent)", color: "white" }}>
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{u.name}</p>
                          <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{u.email}</p>
                        </div>
                        <select
                          value={u.role}
                          onChange={(e) => startTransition(() => updateUserRole(u.id, e.target.value as "ADMIN" | "SELLER"))}
                          className="text-[11px] outline-none px-2 py-1 rounded-[6px]"
                          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                          <option value="SELLER">Säljare</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        <button onClick={() => startTransition(() => deleteUser(u.id))}
                          className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                          style={{ color: "var(--text-dim)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!showNewUser ? (
                    <button onClick={() => setShowNewUser(true)}
                      className="flex items-center gap-2 w-full py-2 text-[13px] font-medium rounded-[8px] transition-colors justify-center"
                      style={{ border: "1.5px dashed var(--border-strong)", color: "var(--text-muted)" }}>
                      <Plus size={14} /> Lägg till användare
                    </button>
                  ) : (
                    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      onSubmit={handleCreateUser} className="flex flex-col gap-3 overflow-hidden">
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: "name", placeholder: "Namn" },
                          { key: "email", placeholder: "Email", type: "email" },
                          { key: "password", placeholder: "Lösenord", type: "password" },
                        ].map(({ key, placeholder, type = "text" }) => (
                          <input key={key} type={type} placeholder={placeholder} required
                            value={newUser[key as keyof typeof newUser]}
                            onChange={(e) => setNewUser((u) => ({ ...u, [key]: e.target.value }))}
                            className={`text-[13px] outline-none px-3 py-2 rounded-[8px] ${key === "password" ? "col-span-2" : ""}`}
                            style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        ))}
                        <select value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as "ADMIN" | "SELLER" }))}
                          className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
                          <option value="SELLER">Säljare</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                      {error && <p className="text-[12px] px-3 py-2 rounded-[8px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowNewUser(false)} className="flex-1 py-2 text-[13px] rounded-[8px]"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Avbryt</button>
                        <button type="submit" disabled={isPending} className="flex-1 py-2 text-[13px] font-medium rounded-[8px]"
                          style={{ background: "var(--accent)", color: "white" }}>Skapa</button>
                      </div>
                    </motion.form>
                  )}
                </Section>
              </motion.div>
            )}

            {tab === "pipeline" && (
              <motion.div key="pipeline" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Section title="Pipeline-steg" icon={Layers}>
                  <div className="flex flex-col gap-2 mb-4">
                    {stages.map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                        <input type="color" value={s.color}
                          onChange={(e) => { const c = e.target.value; startTransition(async () => { await updateStage(s.id, { color: c }); }); }}
                          className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" />
                        <p className="flex-1 text-[13px] font-medium" style={{ color: "var(--text)" }}>{s.name}</p>
                        <div className="flex gap-1">
                          {s.isDefault && <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ background: "var(--info-bg)", color: "var(--info)" }}>Default</span>}
                          {s.isWon && <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ background: "var(--success-bg)", color: "var(--success)" }}>Vunnen</span>}
                          {s.isLost && <span className="text-[10px] px-2 py-[2px] rounded-full" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>Förlorad</span>}
                        </div>
                        {!s.isDefault && !s.isWon && !s.isLost && (
                          <button onClick={() => startTransition(async () => { try { await deleteStage(s.id); } catch (err) { alert(err instanceof Error ? err.message : "Fel"); } })}
                            className="w-7 h-7 flex items-center justify-center rounded-full"
                            style={{ color: "var(--text-dim)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {!showNewStage ? (
                    <button onClick={() => setShowNewStage(true)}
                      className="flex items-center gap-2 w-full py-2 text-[13px] font-medium rounded-[8px] justify-center"
                      style={{ border: "1.5px dashed var(--border-strong)", color: "var(--text-muted)" }}>
                      <Plus size={14} /> Lägg till steg
                    </button>
                  ) : (
                    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      onSubmit={handleCreateStage} className="flex gap-2 overflow-hidden">
                      <input type="color" value={newStage.color} onChange={(e) => setNewStage((s) => ({ ...s, color: e.target.value }))}
                        className="w-10 h-9 rounded-[8px] cursor-pointer border-0 shrink-0" style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)" }} />
                      <input value={newStage.name} onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Stegnamn" required className="flex-1 text-[13px] outline-none px-3 py-2 rounded-[8px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                      <button type="button" onClick={() => setShowNewStage(false)} className="px-3 py-2 text-[12px] rounded-[8px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>Avbryt</button>
                      <button type="submit" disabled={isPending} className="px-3 py-2 text-[12px] font-medium rounded-[8px]"
                        style={{ background: "var(--accent)", color: "white" }}>Skapa</button>
                    </motion.form>
                  )}
                </Section>
              </motion.div>
            )}

            {tab === "products" && (
              <motion.div key="products" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Section title={`Produktkatalog (${products.filter(p => p.active).length})`} icon={Package}>
                  <div className="flex flex-col gap-2 mb-4">
                    {products.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-[10px]"
                        style={{ background: "var(--surface-inset)", border: "1px solid var(--border)", opacity: p.active ? 1 : 0.5 }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{p.name}</p>
                            {p.isRecurring && (
                              <span className="text-[10px] px-1.5 py-[2px] rounded-full" style={{ background: "var(--info-bg)", color: "var(--info)" }}>ARR</span>
                            )}
                          </div>
                          {p.description && <p className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>{p.description}</p>}
                        </div>
                        {p.basePrice != null && (
                          <span className="text-[12px] font-medium shrink-0" style={{ color: "var(--text-muted)" }}>
                            {p.basePrice.toLocaleString("sv-SE")} kr{p.unit ? `/${p.unit}` : ""}
                          </span>
                        )}
                        <button
                          onClick={() => startTransition(() => updateProduct(p.id, { active: !p.active }))}
                          title={p.active ? "Inaktivera" : "Aktivera"}
                          style={{ color: p.active ? "var(--accent)" : "var(--text-dim)" }}>
                          {p.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                        </button>
                        <button onClick={() => startTransition(() => deleteProduct(p.id))}
                          className="w-7 h-7 flex items-center justify-center rounded-full"
                          style={{ color: "var(--text-dim)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {!showNewProduct ? (
                    <button onClick={() => setShowNewProduct(true)}
                      className="flex items-center gap-2 w-full py-2 text-[13px] font-medium rounded-[8px] justify-center"
                      style={{ border: "1.5px dashed var(--border-strong)", color: "var(--text-muted)" }}>
                      <Plus size={14} /> Lägg till produkt
                    </button>
                  ) : (
                    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      onSubmit={handleCreateProduct} className="flex flex-col gap-2 overflow-hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Produktnamn" required className="col-span-2 text-[13px] outline-none px-3 py-2 rounded-[8px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Beskrivning (valfri)" className="col-span-2 text-[13px] outline-none px-3 py-2 rounded-[8px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input type="number" value={newProduct.basePrice} onChange={(e) => setNewProduct((p) => ({ ...p, basePrice: e.target.value }))}
                          placeholder="Baspris (kr)" className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input value={newProduct.unit} onChange={(e) => setNewProduct((p) => ({ ...p, unit: e.target.value }))}
                          placeholder="Enhet (t.ex. mån, år)" className="text-[13px] outline-none px-3 py-2 rounded-[8px]"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--text-muted)" }}>
                        <input type="checkbox" checked={newProduct.isRecurring} onChange={(e) => setNewProduct((p) => ({ ...p, isRecurring: e.target.checked }))} />
                        Återkommande (ARR)
                      </label>
                      {error && <p className="text-[12px] px-3 py-2 rounded-[8px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowNewProduct(false)} className="flex-1 py-2 text-[13px] rounded-[8px]"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Avbryt</button>
                        <button type="submit" disabled={isPending} className="flex-1 py-2 text-[13px] font-medium rounded-[8px]"
                          style={{ background: "var(--accent)", color: "white" }}>Skapa</button>
                      </div>
                    </motion.form>
                  )}
                </Section>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
