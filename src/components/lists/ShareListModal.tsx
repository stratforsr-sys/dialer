"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Users } from "lucide-react";
import { setListAccess } from "@/app/actions/lists";

type UserOption = { id: string; name: string; email: string; role: string };

/** Admin väljer vilka säljare som ska jobba på mappen. */
export function ShareListModal({
  listId,
  listName,
  users,
  currentMemberIds,
  onClose,
}: {
  listId: string;
  listName: string;
  users: UserOption[];
  currentMemberIds: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set(currentMemberIds));
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        await setListAccess(listId, Array.from(selected));
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Kunde inte spara");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-md mx-4 rounded-lg overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
      >
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div
            className="w-8 h-8 rounded-md flex items-center justify-center"
            style={{ background: "var(--accent-muted)", color: "var(--accent)" }}
          >
            <Users size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>
              Vem jobbar på ”{listName}”?
            </h3>
            <p className="text-[11px]" style={{ color: "var(--text-dim)" }}>
              Admin ser alla mappar oavsett
            </p>
          </div>
          <button onClick={onClose} style={{ color: "var(--text-dim)" }}>
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[340px] overflow-y-auto p-2">
          {users.length === 0 ? (
            <p className="text-[13px] p-4 text-center" style={{ color: "var(--text-muted)" }}>
              Inga användare att välja bland
            </p>
          ) : (
            users.map((u) => {
              const on = selected.has(u.id);
              return (
                <button
                  key={u.id}
                  onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-left"
                  style={{ background: on ? "var(--accent-muted)" : "transparent" }}
                >
                  <div
                    className="w-5 h-5 rounded-sm flex items-center justify-center shrink-0"
                    style={{
                      background: on ? "var(--accent)" : "var(--surface-inset)",
                      border: `1px solid ${on ? "var(--accent)" : "var(--border-strong)"}`,
                    }}
                  >
                    {on && <Check size={12} color="var(--bg)" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>
                      {u.name}
                    </p>
                    <p className="text-[11px] truncate" style={{ color: "var(--text-dim)" }}>
                      {u.email}
                    </p>
                  </div>
                  {u.role === "ADMIN" && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--surface-inset)", color: "var(--text-muted)" }}
                    >
                      ADMIN
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {error && (
          <p className="px-5 pb-2 text-[12px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: "1px solid var(--border)", background: "var(--surface-inset)" }}
        >
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {selected.size} {selected.size === 1 ? "vald" : "valda"}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md text-[13px] font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Avbryt
            </button>
            <button
              onClick={save}
              disabled={isPending}
              className="px-4 py-2 rounded-md text-[13px] font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)", opacity: isPending ? 0.6 : 1 }}
            >
              {isPending ? "Sparar…" : "Spara"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
