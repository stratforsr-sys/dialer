"use client";

import { useState, useEffect, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Package, TrendingUp } from "lucide-react";
import { createDeal } from "@/app/actions/deals";
import { getProducts } from "@/app/actions/products";

type Stage = { id: string; name: string; color: string };
type Product = { id: string; name: string; basePrice: number | null; isRecurring: boolean; unit: string | null };

type LineItem = {
  key: string;
  productId: string | null;
  name: string;
  price: string;
  quantity: number;
  isRecurring: boolean;
  unit: string;
};

interface Props {
  leadId: string;
  companyName: string;
  stages: Stage[];
  defaultStageId?: string;
  onClose: () => void;
  onCreated?: () => void;
}

export function CreateDealModal({ leadId, companyName, stages, defaultStageId, onClose, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [products, setProducts] = useState<Product[]>([]);

  // Form state
  const [title, setTitle] = useState(companyName);
  const [stageId, setStageId] = useState(defaultStageId ?? stages[0]?.id ?? "");
  const [valueType, setValueType] = useState<"ONE_TIME" | "ARR">("ONE_TIME");
  const [valueAmount, setValueAmount] = useState("");
  const [probability, setProbability] = useState(20);
  const [closeDate, setCloseDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [freeTextProduct, setFreeTextProduct] = useState("");

  useEffect(() => {
    getProducts().then(setProducts);
  }, []);

  // Update probability when stage changes
  useEffect(() => {
    const stageName = stages.find((s) => s.id === stageId)?.name ?? "";
    if (stageName.toLowerCase().includes("möte")) setProbability(20);
    else if (stageName.toLowerCase().includes("demo")) setProbability(40);
    else if (stageName.toLowerCase().includes("offert")) setProbability(60);
    else if (stageName.toLowerCase().includes("förhandling")) setProbability(80);
  }, [stageId, stages]);

  function addProduct(p: Product) {
    setLineItems((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        productId: p.id,
        name: p.name,
        price: p.basePrice != null ? String(p.basePrice) : "",
        quantity: 1,
        isRecurring: p.isRecurring,
        unit: p.unit ?? "",
      },
    ]);
    setShowProductPicker(false);
  }

  function addFreeText() {
    if (!freeTextProduct.trim()) return;
    setLineItems((prev) => [
      ...prev,
      {
        key: Math.random().toString(36).slice(2),
        productId: null,
        name: freeTextProduct.trim(),
        price: "",
        quantity: 1,
        isRecurring: false,
        unit: "",
      },
    ]);
    setFreeTextProduct("");
    setShowProductPicker(false);
  }

  function removeItem(key: string) {
    setLineItems((prev) => prev.filter((i) => i.key !== key));
  }

  function updateItem(key: string, field: keyof LineItem, value: string | number | boolean) {
    setLineItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numValue = parseFloat(valueAmount.replace(/\s/g, "").replace(",", ".")) || null;

    startTransition(async () => {
      await createDeal({
        leadId,
        title,
        stageId,
        valueType,
        oneTimeValue: valueType === "ONE_TIME" ? numValue : null,
        arrValue: valueType === "ARR" ? numValue : null,
        probability,
        expectedCloseAt: closeDate ? new Date(closeDate) : null,
        notes: notes || undefined,
        products: lineItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: parseFloat(i.price) || null,
          quantity: i.quantity,
          isRecurring: i.isRecurring,
          unit: i.unit || undefined,
        })),
      });
      onCreated?.();
      onClose();
    });
  }

  const inputStyle = {
    background: "var(--surface-inset)",
    border: "1px solid var(--border-strong)",
    borderRadius: "10px",
    padding: "9px 12px",
    color: "var(--text)",
    fontSize: "13px",
    outline: "none",
    width: "100%",
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0"
          style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[560px] overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "20px",
            boxShadow: "var(--shadow-xl)",
            maxHeight: "90vh",
            overflowY: "auto",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-6 py-4 border-b sticky top-0 z-10"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div>
              <h2 className="text-[16px] font-semibold" style={{ fontFamily: "var(--font-serif)", color: "var(--text)" }}>
                Skapa deal
              </h2>
              <p className="text-[12px] mt-[1px]" style={{ color: "var(--text-muted)" }}>{companyName}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-[7px]"
              style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
              <X size={13} style={{ color: "var(--text-muted)" }} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Deal-titel *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                style={inputStyle}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>

            {/* Stage */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Pipeline-steg *
              </label>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                required
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Value type + amount */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Ordervärde
              </label>
              <div className="flex gap-2">
                {/* Toggle */}
                <div
                  className="flex rounded-[9px] overflow-hidden border shrink-0"
                  style={{ borderColor: "var(--border-strong)" }}
                >
                  {(["ONE_TIME", "ARR"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setValueType(type)}
                      className="px-3 py-2 text-[11px] font-semibold transition-colors"
                      style={{
                        background: valueType === type ? "var(--accent)" : "var(--surface-inset)",
                        color: valueType === type ? "var(--bg)" : "var(--text-muted)",
                      }}
                    >
                      {type === "ONE_TIME" ? "Engång" : "ARR/år"}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={valueAmount}
                  onChange={(e) => setValueAmount(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
                <span className="flex items-center text-[12px] px-2 shrink-0" style={{ color: "var(--text-muted)" }}>kr</span>
              </div>
            </div>

            {/* Probability + close date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Sannolikhet <span style={{ color: "var(--text-dim)" }}>{probability}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={probability}
                  onChange={(e) => setProbability(Number(e.target.value))}
                  className="w-full"
                  style={{ accentColor: "var(--accent)" }}
                />
                <div className="flex justify-between text-[10px] mt-1" style={{ color: "var(--text-dim)" }}>
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                  Förväntat avslut
                </label>
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  style={inputStyle}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
                />
              </div>
            </div>

            {/* Products */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Produkter
              </label>

              {lineItems.length > 0 && (
                <div className="space-y-2 mb-2">
                  {lineItems.map((item) => (
                    <div key={item.key} className="flex items-center gap-2 p-2.5 rounded-[10px]"
                      style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}>
                      <Package size={12} style={{ color: "var(--text-dim)", flexShrink: 0 }} />
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item.key, "name", e.target.value)}
                        className="flex-1 min-w-0 text-[12px] bg-transparent outline-none"
                        style={{ color: "var(--text)" }}
                      />
                      <input
                        type="text"
                        inputMode="numeric"
                        value={item.price}
                        onChange={(e) => updateItem(item.key, "price", e.target.value)}
                        placeholder="Pris"
                        className="w-20 text-[12px] text-right bg-transparent outline-none"
                        style={{ color: "var(--text-secondary)" }}
                      />
                      <span className="text-[11px]" style={{ color: "var(--text-dim)" }}>kr</span>
                      <button type="button" onClick={() => removeItem(item.key)}
                        className="shrink-0 transition-colors"
                        style={{ color: "var(--text-dim)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--danger)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add product */}
              <AnimatePresence>
                {showProductPicker ? (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="rounded-[12px] border overflow-hidden"
                    style={{ borderColor: "var(--border-strong)" }}
                  >
                    {products.length > 0 && (
                      <div className="border-b" style={{ borderColor: "var(--border)" }}>
                        {products.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProduct(p)}
                            className="flex items-center justify-between w-full px-3 py-2.5 text-left transition-colors"
                            style={{ background: "transparent" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-inset)")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          >
                            <div className="flex items-center gap-2">
                              <Package size={12} style={{ color: "var(--text-dim)" }} />
                              <span className="text-[13px]" style={{ color: "var(--text)" }}>{p.name}</span>
                              {p.isRecurring && (
                                <span className="text-[10px] px-1.5 py-[1px] rounded-full"
                                  style={{ background: "var(--info-bg)", color: "var(--info)", border: "1px solid var(--info-border)" }}>
                                  Återkommande
                                </span>
                              )}
                            </div>
                            {p.basePrice != null && (
                              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                                {p.basePrice.toLocaleString("sv-SE")} kr{p.unit ? `/${p.unit}` : ""}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2 p-2" style={{ background: "var(--surface-inset)" }}>
                      <input
                        type="text"
                        value={freeTextProduct}
                        onChange={(e) => setFreeTextProduct(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addFreeText())}
                        placeholder="Fritext-produkt..."
                        style={{ ...inputStyle, padding: "7px 10px", fontSize: "12px" }}
                      />
                      <button type="button" onClick={addFreeText}
                        className="px-3 py-1.5 text-[12px] font-medium rounded-[8px] shrink-0"
                        style={{ background: "var(--accent)", color: "var(--bg)" }}>
                        Lägg till
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowProductPicker(true)}
                    className="flex items-center gap-1.5 text-[12px] px-3 py-2 rounded-[9px] transition-colors w-full"
                    style={{ background: "var(--surface-inset)", border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}
                  >
                    <Plus size={12} />
                    Lägg till produkt
                  </button>
                )}
              </AnimatePresence>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "var(--text-muted)" }}>
                Anteckningar
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Bakgrund, kontext, nästa steg..."
                style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "var(--border-focus)")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-strong)")}
              />
            </div>

            {/* Footer actions */}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-dim)" }}>
                <TrendingUp size={11} />
                <span>Weighted: {valueAmount ? Math.round((parseFloat(valueAmount.replace(/\s/g, "").replace(",", ".")) || 0) * probability / 100).toLocaleString("sv-SE") : 0} kr</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-[13px] font-medium rounded-[10px]"
                  style={{ background: "var(--surface-inset)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}>
                  Avbryt
                </button>
                <button type="submit" disabled={isPending || !title.trim() || !stageId}
                  className="px-5 py-2 text-[13px] font-semibold rounded-[10px] transition-opacity"
                  style={{ background: "var(--accent)", color: "var(--bg)", opacity: isPending ? 0.6 : 1 }}>
                  {isPending ? "Skapar..." : "Skapa deal"}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
