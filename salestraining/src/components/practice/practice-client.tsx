"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { startPracticeSession, generateScenarioCard, submitScenarioAnswer } from "@/actions/practice";
import { LevelBadge } from "@/components/gamification/level-badge";

const USER_ID = "default-user";

type Phase = "setup" | "scenario" | "answering" | "feedback" | "complete";

interface Scenario {
  situation: string;
  customerQuote: string;
  expectedApproach: string;
  idealResponse: string;
  evaluationCriteria: string[];
}

interface Feedback {
  score: number;
  breakdown: Record<string, { score: number; comment: string }>;
  strengths: string[];
  improvements: string[];
  feedForward: string;
  levelIndicator: string;
}

export function PracticeClient() {
  const searchParams = useSearchParams();
  const techniqueIdParam = searchParams.get("technique");

  const [phase, setPhase] = useState<Phase>("setup");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState("medium");
  const [techniqueId, setTechniqueId] = useState(techniqueIdParam || "");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [cardCount, setCardCount] = useState(0);

  const startSession = useCallback(async () => {
    setLoading(true);
    try {
      const session = await startPracticeSession(USER_ID, "scenario");
      setSessionId(session.id);
      await loadNextScenario(session.id);
    } catch {
      setLoading(false);
    }
  }, []);

  async function loadNextScenario(sid?: string) {
    setLoading(true);
    setAnswer("");
    setFeedback(null);
    setScore(null);
    setShowDetails(false);

    try {
      const result = await generateScenarioCard(USER_ID, techniqueId || undefined, difficulty);
      setScenario(result.scenario);
      setTechniqueId(result.techniqueId);
      setPhase("scenario");
    } catch {
      // Scenario generation failed
    }
    setLoading(false);
  }

  async function handleSubmit() {
    if (!answer.trim() || !sessionId || !scenario) return;
    setLoading(true);
    setPhase("feedback");

    try {
      const result = await submitScenarioAnswer(
        USER_ID,
        sessionId,
        techniqueId,
        JSON.stringify(scenario),
        answer,
        difficulty
      );
      setFeedback(result.evaluation);
      setScore(result.score);
      setCardCount((c) => c + 1);
    } catch {
      // Evaluation failed
    }
    setLoading(false);
  }

  // Auto-start if technique param is provided
  useEffect(() => {
    if (techniqueIdParam && phase === "setup") {
      startSession();
    }
  }, [techniqueIdParam, phase, startSession]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-[var(--space-6)] py-[var(--space-8)]">
      <AnimatePresence mode="wait">
        {/* ============================================================
            SETUP PHASE
            ============================================================ */}
        {phase === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-lg"
          >
            <h1
              className="font-heading text-3xl font-semibold text-center mb-[var(--space-2)]"
              style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
            >
              Scenarioträning
            </h1>
            <p className="text-sm text-center mb-[var(--space-8)]" style={{ color: "var(--text-tertiary)" }}>
              AI:n genererar realistiska kundsituationer. Svara som om du sitter i mötet.
            </p>

            {/* Difficulty */}
            <div className="mb-[var(--space-6)]">
              <label className="block text-xs font-medium mb-[var(--space-3)]" style={{ color: "var(--text-secondary)" }}>
                Svårighetsgrad
              </label>
              <div className="grid grid-cols-4 gap-[var(--space-2)]">
                {[
                  { value: "easy", label: "Enkel", desc: "Samarbetsvillig" },
                  { value: "medium", label: "Medel", desc: "Skeptisk" },
                  { value: "hard", label: "Svår", desc: "Motstridig" },
                  { value: "expert", label: "Expert", desc: "Fientlig" },
                ].map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className="flex flex-col items-center gap-[2px] px-[var(--space-3)] py-[var(--space-3)] text-center transition-all"
                    style={{
                      background: difficulty === d.value ? "var(--accent-muted)" : "var(--bg-card)",
                      border: `1px solid ${difficulty === d.value ? "var(--border-accent)" : "var(--border-subtle)"}`,
                      borderRadius: "var(--radius-md)",
                      color: difficulty === d.value ? "var(--accent)" : "var(--text-secondary)",
                    }}
                  >
                    <span className="text-sm font-medium">{d.label}</span>
                    <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{d.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={startSession}
              disabled={loading}
              className="w-full flex items-center justify-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-4)] text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {loading ? "Genererar scenario..." : "Starta träning"}
            </button>
          </motion.div>
        )}

        {/* ============================================================
            SCENARIO + ANSWERING PHASE
            ============================================================ */}
        {(phase === "scenario" || phase === "answering") && scenario && (
          <motion.div
            key="scenario"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-xl"
          >
            {/* Progress */}
            <div className="flex items-center justify-between mb-[var(--space-6)]">
              <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                Kort #{cardCount + 1}
              </span>
              <LevelBadge level={difficulty} size="sm" />
            </div>

            {/* Scenario Card */}
            <div
              className="card-static px-[var(--space-6)] py-[var(--space-6)] mb-[var(--space-6)]"
              style={{ borderLeft: "3px solid var(--accent)" }}
            >
              <p className="text-sm leading-relaxed mb-[var(--space-4)]" style={{ color: "var(--text-secondary)" }}>
                {scenario.situation}
              </p>
              <blockquote
                className="text-base font-medium italic px-[var(--space-4)] py-[var(--space-3)]"
                style={{
                  color: "var(--text-primary)",
                  background: "var(--bg-elevated)",
                  borderRadius: "var(--radius-md)",
                  borderLeft: "3px solid var(--warning)",
                }}
              >
                &ldquo;{scenario.customerQuote}&rdquo;
              </blockquote>
            </div>

            {/* Answer Input */}
            <div className="mb-[var(--space-4)]">
              <textarea
                value={answer}
                onChange={(e) => {
                  setAnswer(e.target.value);
                  if (phase === "scenario") setPhase("answering");
                }}
                placeholder="Skriv ditt svar som om du sitter i mötet..."
                rows={5}
                disabled={loading}
                autoFocus
                className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none resize-y transition-colors"
                style={{
                  background: "var(--bg-input)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-default)",
                  borderRadius: "var(--radius-md)",
                  minHeight: "120px",
                }}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !answer.trim()}
              className="w-full flex items-center justify-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {loading ? "Utvärderar..." : "Skicka svar"}
            </button>
          </motion.div>
        )}

        {/* ============================================================
            FEEDBACK PHASE
            ============================================================ */}
        {phase === "feedback" && feedback && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="w-full max-w-xl"
          >
            {/* Score */}
            <div className="text-center mb-[var(--space-6)]">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="inline-flex items-center justify-center w-20 h-20 mb-[var(--space-3)]"
                style={{
                  background: score! >= 80 ? "var(--success-muted)" : score! >= 60 ? "var(--warning-muted)" : "var(--error-muted)",
                  borderRadius: "var(--radius-xl)",
                  border: `2px solid ${score! >= 80 ? "var(--success)" : score! >= 60 ? "var(--warning)" : "var(--error)"}`,
                }}
              >
                <span
                  className="font-mono text-3xl font-bold"
                  style={{ color: score! >= 80 ? "var(--success)" : score! >= 60 ? "var(--warning)" : "var(--error)" }}
                >
                  {score}
                </span>
              </motion.div>
              <div className="flex items-center justify-center gap-[var(--space-2)]">
                <LevelBadge level={feedback.levelIndicator} size="md" />
              </div>
            </div>

            {/* Breakdown (compact) */}
            <div className="card-static px-[var(--space-5)] py-[var(--space-4)] mb-[var(--space-4)]">
              <div className="grid gap-[var(--space-3)]">
                {Object.entries(feedback.breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-[var(--space-3)]">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-[2px]">
                        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                          {formatBreakdownKey(key)}
                        </span>
                        <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                          {val.score}
                        </span>
                      </div>
                      <div className="h-1.5 w-full" style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-full)" }}>
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${(val.score / getMaxForKey(key)) * 100}%`,
                            background: val.score / getMaxForKey(key) >= 0.7 ? "var(--success)" : val.score / getMaxForKey(key) >= 0.5 ? "var(--warning)" : "var(--error)",
                            borderRadius: "var(--radius-full)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Expandable Details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-center gap-[var(--space-2)] py-[var(--space-3)] text-xs transition-colors mb-[var(--space-4)]"
              style={{ color: "var(--text-tertiary)" }}
            >
              {showDetails ? "Dölj detaljer" : "Visa detaljer"}
              <svg
                width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
                style={{ transform: showDetails ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s" }}
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
            </button>

            <AnimatePresence>
              {showDetails && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mb-[var(--space-4)]"
                >
                  {/* Strengths */}
                  {feedback.strengths.length > 0 && (
                    <div className="mb-[var(--space-4)]">
                      <h4 className="text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--success)" }}>Styrkor</h4>
                      <ul className="flex flex-col gap-[var(--space-1)]">
                        {feedback.strengths.map((s, i) => (
                          <li key={i} className="text-sm flex gap-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
                            <span style={{ color: "var(--success)" }}>+</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Improvements */}
                  {feedback.improvements.length > 0 && (
                    <div className="mb-[var(--space-4)]">
                      <h4 className="text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--warning)" }}>Förbättringar</h4>
                      <ul className="flex flex-col gap-[var(--space-1)]">
                        {feedback.improvements.map((s, i) => (
                          <li key={i} className="text-sm flex gap-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
                            <span style={{ color: "var(--warning)" }}>~</span> {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Feed Forward */}
                  <div
                    className="px-[var(--space-4)] py-[var(--space-3)]"
                    style={{
                      background: "var(--accent-subtle)",
                      borderRadius: "var(--radius-md)",
                      border: "1px solid var(--border-accent)",
                    }}
                  >
                    <h4 className="text-xs font-medium mb-[var(--space-1)]" style={{ color: "var(--accent)" }}>Feed Forward</h4>
                    <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{feedback.feedForward}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Next */}
            <div className="flex gap-[var(--space-3)]">
              <button
                onClick={() => loadNextScenario()}
                className="flex-1 flex items-center justify-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] text-sm font-medium transition-all"
                style={{
                  background: "var(--accent)",
                  color: "var(--text-inverse)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                Nästa scenario
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </button>
              <button
                onClick={() => setPhase("complete")}
                className="px-[var(--space-4)] py-[var(--space-3)] text-sm transition-all"
                style={{
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                Avsluta
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================================
            COMPLETE PHASE
            ============================================================ */}
        {phase === "complete" && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-md"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
              className="text-6xl mb-[var(--space-5)]"
            >
              &#x1F3AF;
            </motion.div>
            <h2 className="font-heading text-2xl font-semibold mb-[var(--space-2)]" style={{ color: "var(--text-primary)" }}>
              Session klar!
            </h2>
            <p className="text-sm mb-[var(--space-6)]" style={{ color: "var(--text-tertiary)" }}>
              {cardCount} scenariokort avklarade
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] text-sm font-medium"
              style={{
                background: "var(--bg-card)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            >
              Tillbaka till Dashboard
            </a>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatBreakdownKey(key: string): string {
  const map: Record<string, string> = {
    rightTechnique: "Rätt teknik",
    frameworkCoverage: "Ramverk",
    objectionHandling: "Invändningar",
    naturalFormulation: "Naturligt språk",
    meetingStructure: "Mötesstruktur",
  };
  return map[key] || key;
}

function getMaxForKey(key: string): number {
  const map: Record<string, number> = {
    rightTechnique: 25,
    frameworkCoverage: 25,
    objectionHandling: 20,
    naturalFormulation: 15,
    meetingStructure: 15,
  };
  return map[key] || 25;
}
