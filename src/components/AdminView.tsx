"use client";

import { useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Plus, Trash2, Package, ToggleLeft, ToggleRight } from "lucide-react";
import { createUser, deleteUser, updateUserRole, getUserDeletionImpact, type UserDeletionImpact } from "@/app/actions/users";
import { createProduct, updateProduct, deleteProduct } from "@/app/actions/products";

type UserRow = { id: string; name: string; email: string; role: string; createdAt: Date };

const nf = (n: number) => n.toLocaleString("sv-SE");

/** Varför kontot inte går att ta bort — eller null om det går. */
function blockedReason(i: UserDeletionImpact): string | null {
  if (i.isSelf) return "Du kan inte ta bort dig själv.";
  if (i.isSystem) return "Det här kontot bär historiken efter redan raderade användare.";
  if (i.isLastAdmin) return "Det måste finnas minst en admin kvar. Gör någon annan till admin först.";
  return null;
}

/** Vad raderingen faktiskt gör, i klartext. En knapp som river 629 samtal ska
 *  säga att den gör det innan den gör det. */
function impactLines(i: UserDeletionImpact): string[] {
  const lines: string[] = [];

  const history: string[] = [];
  if (i.calls) history.push(`${nf(i.calls)} samtal`);
  if (i.sessions) history.push(`${nf(i.sessions)} pass`);
  if (i.callbacksTotal - i.callbacksOpen) history.push(`${nf(i.callbacksTotal - i.callbacksOpen)} avslutade återkomster`);
  if (i.deals) history.push(`${nf(i.deals)} affärer`);
  if (i.activities) history.push(`${nf(i.activities)} aktiviteter`);
  if (i.lists) history.push(`${nf(i.lists)} listor`);
  if (i.scripts) history.push(`${nf(i.scripts)} manus`);
  if (history.length) {
    lines.push(`${history.join(", ")} ligger kvar i statistiken, men skrivs om till "Borttagen användare".`);
  }

  if (i.callbacksOpen) {
    lines.push(`${nf(i.callbacksOpen)} öppna återkomster flyttas till dig — de är löften till kunder och får inte tappas bort.`);
  }
  if (i.leads) {
    lines.push(
      i.claims
        ? `${nf(i.leads)} bolag rörs inte, men ${nf(i.claims)} av dem släpps tillbaka i rotationen.`
        : `${nf(i.leads)} bolag rörs inte — de tillhör databasen, inte säljaren.`
    );
  }
  if (i.leases) lines.push(`${nf(i.leases)} parkeringar i dialern släpps direkt.`);

  if (!lines.length) lines.push("Kontot har ingen historik. Det försvinner utan spår.");
  return lines;
}
type Product = { id: string; name: string; description: string | null; basePrice: number | null; isRecurring: boolean; unit: string | null; active: boolean };

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <Icon size={15} style={{ color: "var(--text-muted)" }} />
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function AdminView({ users, products }: { users: UserRow[]; products: Product[] }) {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"users" | "products">("users");
  const [showNewUser, setShowNewUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "SELLER" as "ADMIN" | "SELLER" });
  const [showNewProduct, setShowNewProduct] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", description: "", basePrice: "", isRecurring: false, unit: "" });
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<UserDeletionImpact | null>(null);
  const [userError, setUserError] = useState("");

  function askDelete(id: string) {
    setUserError("");
    setConfirm(null);
    startTransition(async () => {
      try {
        setConfirm(await getUserDeletionImpact(id));
      } catch (err) {
        setUserError(err instanceof Error ? err.message : "Kunde inte läsa kontot");
      }
    });
  }

  function doDelete(id: string) {
    setUserError("");
    startTransition(async () => {
      try {
        await deleteUser(id);
        setConfirm(null);
      } catch (err) {
        setUserError(err instanceof Error ? err.message : "Kunde inte ta bort kontot");
        setConfirm(null);
      }
    });
  }

  function changeRole(id: string, role: "ADMIN" | "SELLER") {
    setUserError("");
    startTransition(async () => {
      try {
        await updateUserRole(id, role);
      } catch (err) {
        setUserError(err instanceof Error ? err.message : "Kunde inte ändra rollen");
      }
    });
  }

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
        <div className="flex gap-1 p-1 rounded-md" style={{ background: "var(--surface-inset)" }}>
          {(["users", "products"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-[5px] text-[12px] font-medium rounded-sm transition-colors"
              style={{
                background: tab === t ? "var(--surface)" : "transparent",
                color: tab === t ? "var(--text)" : "var(--text-muted)",
                boxShadow: tab === t ? "var(--shadow-1)" : "none",
              }}>
              {t === "users" ? "Användare" : "Produkter"}
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
                      <div key={u.id} className="flex flex-col rounded-md overflow-hidden"
                        style={{ background: "var(--surface-inset)", border: `1px solid ${confirm?.id === u.id ? "var(--danger)" : "var(--border)"}` }}>
                        <div className="flex items-center gap-3 px-3 py-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                            style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{u.name}</p>
                            <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>{u.email}</p>
                          </div>
                          <select
                            value={u.role}
                            onChange={(e) => changeRole(u.id, e.target.value as "ADMIN" | "SELLER")}
                            className="text-[11px] outline-none px-2 py-1 rounded-sm"
                            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                            <option value="SELLER">Säljare</option>
                            <option value="ADMIN">Admin</option>
                          </select>
                          <button onClick={() => (confirm?.id === u.id ? setConfirm(null) : askDelete(u.id))}
                            title="Ta bort konto"
                            className="w-7 h-7 flex items-center justify-center rounded-full transition-colors"
                            style={{ color: confirm?.id === u.id ? "var(--danger)" : "var(--text-dim)" }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = confirm?.id === u.id ? "var(--danger)" : "var(--text-dim)")}>
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <AnimatePresence initial={false}>
                          {confirm && confirm.id === u.id && (
                            <motion.div key="confirm" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden">
                              <div className="px-3 pb-3 pt-1 flex flex-col gap-2 border-t" style={{ borderColor: "var(--border)" }}>
                                {blockedReason(confirm) ? (
                                  <p className="text-[12px] px-3 py-2 rounded-md"
                                    style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                                    {blockedReason(confirm)}
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[12px] font-medium" style={{ color: "var(--text)" }}>
                                      Ta bort {confirm.name}? Kontot raderas ur databasen och går inte att återskapa.
                                    </p>
                                    <ul className="flex flex-col gap-1">
                                      {impactLines(confirm).map((line, n) => (
                                        <li key={n} className="text-[11px] leading-[1.5] pl-3 relative" style={{ color: "var(--text-muted)" }}>
                                          <span className="absolute left-0" style={{ color: "var(--text-dim)" }}>·</span>
                                          {line}
                                        </li>
                                      ))}
                                    </ul>
                                  </>
                                )}
                                <div className="flex gap-2 pt-1">
                                  <button onClick={() => setConfirm(null)} className="flex-1 py-[6px] text-[12px] rounded-md"
                                    style={{ background: "var(--surface)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                                    Avbryt
                                  </button>
                                  {!blockedReason(confirm) && (
                                    <button onClick={() => doDelete(confirm.id)} disabled={isPending}
                                      className="flex-1 py-[6px] text-[12px] font-medium rounded-md"
                                      style={{ background: "var(--danger)", color: "var(--on-accent)", opacity: isPending ? 0.6 : 1 }}>
                                      {isPending ? "Tar bort…" : "Ta bort"}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>

                  {userError && (
                    <p className="text-[12px] px-3 py-2 rounded-md mb-4" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
                      {userError}
                    </p>
                  )}

                  {!showNewUser ? (
                    <button onClick={() => setShowNewUser(true)}
                      className="flex items-center gap-2 w-full py-2 text-[13px] font-medium rounded-md transition-colors justify-center"
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
                            className={`text-[13px] outline-none px-3 py-2 rounded-md ${key === "password" ? "col-span-2" : ""}`}
                            style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        ))}
                        <select value={newUser.role} onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value as "ADMIN" | "SELLER" }))}
                          className="text-[13px] outline-none px-3 py-2 rounded-md"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
                          <option value="SELLER">Säljare</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </div>
                      {error && <p className="text-[12px] px-3 py-2 rounded-md" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowNewUser(false)} className="flex-1 py-2 text-[13px] rounded-md"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Avbryt</button>
                        <button type="submit" disabled={isPending} className="flex-1 py-2 text-[13px] font-medium rounded-md"
                          style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Skapa</button>
                      </div>
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
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-md"
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
                      className="flex items-center gap-2 w-full py-2 text-[13px] font-medium rounded-md justify-center"
                      style={{ border: "1.5px dashed var(--border-strong)", color: "var(--text-muted)" }}>
                      <Plus size={14} /> Lägg till produkt
                    </button>
                  ) : (
                    <motion.form initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                      onSubmit={handleCreateProduct} className="flex flex-col gap-2 overflow-hidden">
                      <div className="grid grid-cols-2 gap-2">
                        <input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))}
                          placeholder="Produktnamn" required className="col-span-2 text-[13px] outline-none px-3 py-2 rounded-md"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input value={newProduct.description} onChange={(e) => setNewProduct((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Beskrivning (valfri)" className="col-span-2 text-[13px] outline-none px-3 py-2 rounded-md"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input type="number" value={newProduct.basePrice} onChange={(e) => setNewProduct((p) => ({ ...p, basePrice: e.target.value }))}
                          placeholder="Baspris (kr)" className="text-[13px] outline-none px-3 py-2 rounded-md"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                        <input value={newProduct.unit} onChange={(e) => setNewProduct((p) => ({ ...p, unit: e.target.value }))}
                          placeholder="Enhet (t.ex. mån, år)" className="text-[13px] outline-none px-3 py-2 rounded-md"
                          style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text)" }} />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer text-[13px]" style={{ color: "var(--text-muted)" }}>
                        <input type="checkbox" checked={newProduct.isRecurring} onChange={(e) => setNewProduct((p) => ({ ...p, isRecurring: e.target.checked }))} />
                        Återkommande (ARR)
                      </label>
                      {error && <p className="text-[12px] px-3 py-2 rounded-md" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowNewProduct(false)} className="flex-1 py-2 text-[13px] rounded-md"
                          style={{ background: "var(--surface-inset)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>Avbryt</button>
                        <button type="submit" disabled={isPending} className="flex-1 py-2 text-[13px] font-medium rounded-md"
                          style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Skapa</button>
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
