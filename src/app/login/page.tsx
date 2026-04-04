"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError("Fel email eller lösenord");
    } else {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      {/* Subtle background grid */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(var(--text) 1px, transparent 1px), linear-gradient(90deg, var(--text) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[400px] mx-4"
      >
        {/* Card */}
        <div
          className="relative overflow-hidden"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            borderRadius: "22px",
            boxShadow: "var(--shadow-lg)",
            padding: "40px",
          }}
        >
          {/* Top accent bar */}
          <div
            className="absolute top-0 left-0 right-0 h-[2px]"
            style={{
              background:
                "linear-gradient(90deg, transparent, var(--accent), transparent)",
            }}
          />

          {/* Logo / Brand */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-2">
              <div
                className="w-8 h-8 rounded-[8px] flex items-center justify-center"
                style={{ background: "var(--accent)", flexShrink: 0 }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8a5 5 0 0 1 5-5m0 0a5 5 0 0 1 5 5m-5-5V2m5 6h1M2 8H1m2.636-3.364-.707-.707M12.07 4.636l.707-.707M8 13v1m-3.364-2.636-.707.707M11.364 11.364l.707.707"
                    stroke="white"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <span
                className="text-[15px] font-semibold tracking-tight"
                style={{ color: "var(--text)" }}
              >
                Sales Hub
              </span>
            </div>
            <p
              className="text-[13px] mt-4"
              style={{ color: "var(--text-muted)" }}
            >
              Logga in för att fortsätta
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-[6px]">
              <label
                className="text-[12px] font-medium tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="din@email.se"
                required
                autoFocus
                className="w-full text-[14px] outline-none transition-all duration-150"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--text)",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--accent)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-strong)")
                }
              />
            </div>

            <div className="flex flex-col gap-[6px]">
              <label
                className="text-[12px] font-medium tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                Lösenord
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full text-[14px] outline-none transition-all duration-150"
                style={{
                  background: "var(--surface-inset)",
                  border: "1px solid var(--border-strong)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  color: "var(--text)",
                }}
                onFocus={(e) =>
                  (e.target.style.borderColor = "var(--accent)")
                }
                onBlur={(e) =>
                  (e.target.style.borderColor = "var(--border-strong)")
                }
              />
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[13px] px-3 py-2 rounded-[8px]"
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger)",
                }}
              >
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="relative w-full text-[14px] font-semibold transition-all duration-150 mt-2"
              style={{
                background: loading ? "var(--accent-muted)" : "var(--accent)",
                color: "white",
                borderRadius: "10px",
                padding: "11px",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="w-[14px] h-[14px] border-2 border-white/30 border-t-white rounded-full animate-spin"
                  />
                  Loggar in...
                </span>
              ) : (
                "Logga in"
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p
          className="text-center text-[12px] mt-6"
          style={{ color: "var(--text-dim)" }}
        >
          Telink Sales Hub
        </p>
      </motion.div>
    </div>
  );
}
