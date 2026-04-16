"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { sendRoleplayMessage, endRoleplay } from "@/actions/roleplay";

interface Message {
  role: "seller" | "buyer";
  content: string;
  timestamp?: number;
}

interface Persona {
  name: string;
  title: string;
  company: string;
}

interface Scorecard {
  rightTechniqueScore: number;
  frameworkCoverage: number;
  objectionHandling: number;
  meetingStructure: number;
  naturalFormulation: number;
  totalScore: number;
  detailedFeedback: string;
}

interface RoleplayData {
  id: string;
  meetingType: string;
  difficulty: string;
  transcript: string;
  persona: Persona;
  scorecard: Scorecard | null;
}

export function RoleplayChatClient({ roleplay }: { roleplay: RoleplayData }) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(roleplay.transcript);
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(!!roleplay.scorecard);
  const [scorecard, setScorecard] = useState<Scorecard | null>(roleplay.scorecard);
  const [elapsed, setElapsed] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Timer
  useEffect(() => {
    if (ended) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, [ended]);

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input
  useEffect(() => {
    if (!loading && !ended) inputRef.current?.focus();
  }, [loading, ended]);

  async function handleSend() {
    if (!input.trim() || loading || ended) return;
    const text = input.trim();
    setInput("");

    const newMessages: Message[] = [...messages, { role: "seller", content: text, timestamp: elapsed }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const result = await sendRoleplayMessage(roleplay.id, text, elapsed);
      setMessages([...newMessages, { role: "buyer", content: result.buyerResponse, timestamp: elapsed }]);
    } catch {
      // Message send failed
    }
    setLoading(false);
  }

  async function handleEnd() {
    setLoading(true);
    try {
      const result = await endRoleplay(roleplay.id);
      const eval_ = result.evaluation;
      setScorecard({
        rightTechniqueScore: eval_.breakdown.rightTechnique.score,
        frameworkCoverage: eval_.breakdown.frameworkCoverage.score,
        objectionHandling: eval_.breakdown.objectionHandling.score,
        meetingStructure: eval_.breakdown.meetingStructure.score,
        naturalFormulation: eval_.breakdown.naturalFormulation.score,
        totalScore: eval_.score,
        detailedFeedback: eval_.feedForward + "\n\n" + eval_.strengths.join("\n") + "\n\n" + eval_.improvements.join("\n"),
      });
      setEnded(true);
    } catch {
      // End roleplay failed
    }
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]" style={{ background: "var(--bg-root)" }}>
      {/* Header Bar */}
      <div
        className="flex items-center justify-between px-[var(--space-6)] h-14 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-panel)" }}
      >
        <div className="flex items-center gap-[var(--space-3)]">
          <div
            className="w-8 h-8 flex items-center justify-center text-sm font-medium"
            style={{
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-full)",
              color: "var(--text-secondary)",
            }}
          >
            {roleplay.persona.name.charAt(0)}
          </div>
          <div>
            <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              {roleplay.persona.name}
            </span>
            <span className="text-xs ml-[var(--space-2)]" style={{ color: "var(--text-tertiary)" }}>
              {roleplay.persona.title}, {roleplay.persona.company}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-[var(--space-4)]">
          <span className="font-mono text-sm" style={{ color: "var(--text-tertiary)" }}>
            {formatTime(elapsed)}
          </span>
          {!ended && (
            <button
              onClick={handleEnd}
              disabled={loading || messages.length < 2}
              className="px-[var(--space-4)] py-[var(--space-2)] text-xs font-medium transition-all disabled:opacity-40"
              style={{
                background: "var(--error-muted)",
                color: "var(--error)",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
              }}
            >
              Avsluta samtal
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-6)]">
        <div className="max-w-2xl mx-auto flex flex-col gap-[var(--space-5)]">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex ${msg.role === "seller" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className="max-w-[80%] px-[var(--space-5)] py-[var(--space-4)]"
                  style={{
                    background: msg.role === "seller" ? "var(--accent)" : "var(--bg-card)",
                    color: msg.role === "seller" ? "white" : "var(--text-primary)",
                    borderRadius: msg.role === "seller"
                      ? "var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)"
                      : "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
                    border: msg.role === "buyer" ? "1px solid var(--border-subtle)" : "none",
                  }}
                >
                  {msg.role === "buyer" && (
                    <div className="text-[10px] font-medium mb-[var(--space-1)]" style={{ color: "var(--text-tertiary)" }}>
                      {roleplay.persona.name}
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && !ended && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
              <div
                className="px-[var(--space-5)] py-[var(--space-4)] flex gap-1"
                style={{
                  background: "var(--bg-card)",
                  borderRadius: "var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    className="w-2 h-2 rounded-full"
                    style={{ background: "var(--text-tertiary)" }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Scorecard (when ended) */}
      {ended && scorecard && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-[var(--space-6)] py-[var(--space-6)]"
          style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-panel)" }}
        >
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-[var(--space-4)] mb-[var(--space-5)]">
              <div
                className="w-16 h-16 flex items-center justify-center"
                style={{
                  background: scorecard.totalScore >= 70 ? "var(--success-muted)" : "var(--warning-muted)",
                  borderRadius: "var(--radius-xl)",
                  border: `2px solid ${scorecard.totalScore >= 70 ? "var(--success)" : "var(--warning)"}`,
                }}
              >
                <span
                  className="font-mono text-2xl font-bold"
                  style={{ color: scorecard.totalScore >= 70 ? "var(--success)" : "var(--warning)" }}
                >
                  {scorecard.totalScore}
                </span>
              </div>
              <div>
                <h3 className="font-heading text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  Samtal avslutat
                </h3>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {formatTime(elapsed)} · {messages.length} meddelanden
                </p>
              </div>
            </div>

            {/* Score breakdown */}
            <div className="grid grid-cols-5 gap-[var(--space-3)] mb-[var(--space-5)]">
              {[
                { label: "Teknik", score: scorecard.rightTechniqueScore, max: 25 },
                { label: "Ramverk", score: scorecard.frameworkCoverage, max: 25 },
                { label: "Invändning", score: scorecard.objectionHandling, max: 20 },
                { label: "Struktur", score: scorecard.meetingStructure, max: 15 },
                { label: "Naturligt", score: scorecard.naturalFormulation, max: 15 },
              ].map((item) => (
                <div key={item.label} className="card-static px-[var(--space-3)] py-[var(--space-3)] text-center">
                  <div className="font-mono text-lg font-bold" style={{
                    color: item.score / item.max >= 0.7 ? "var(--success)" : item.score / item.max >= 0.5 ? "var(--warning)" : "var(--error)",
                  }}>
                    {item.score}
                  </div>
                  <div className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {item.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Feedback */}
            <div
              className="text-sm leading-relaxed"
              style={{
                color: "var(--text-secondary)",
                background: "var(--bg-card)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-subtle)",
                padding: "var(--space-5)",
              }}
            >
              {scorecard.detailedFeedback}
            </div>

            <a
              href="/"
              className="inline-flex items-center gap-[var(--space-2)] mt-[var(--space-5)] px-[var(--space-5)] py-[var(--space-3)] text-sm font-medium transition-all"
              style={{
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            >
              Tillbaka till Dashboard
            </a>
          </div>
        </motion.div>
      )}

      {/* Input Bar (when not ended) */}
      {!ended && (
        <div
          className="px-[var(--space-6)] py-[var(--space-4)] flex-shrink-0"
          style={{ borderTop: "1px solid var(--border-subtle)", background: "var(--bg-panel)" }}
        >
          <div className="max-w-2xl mx-auto flex gap-[var(--space-3)]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Skriv ditt svar..."
              rows={1}
              disabled={loading}
              className="flex-1 px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none resize-none"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              className="flex items-center justify-center w-10 h-10 flex-shrink-0 transition-all disabled:opacity-30"
              style={{
                background: "var(--accent)",
                borderRadius: "var(--radius-md)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="white">
                <path d="M2 8l5-5v3h5v4H7v3L2 8z" transform="rotate(-90 8 8)" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
