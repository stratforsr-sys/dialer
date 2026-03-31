"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Loader2, FlaskConical, ChevronDown, RotateCcw, Sparkles } from "lucide-react";
import { PROMPT_PRESETS } from "@/lib/research/prompts";
import type { ChatMessage } from "@/app/api/chat/research/route";

// ─── Markdown renderer (minimal, no deps) ────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^#{1,3} (.+)$/gm, "<p class='font-semibold text-base mt-4 mb-1'>$1</p>")
    .replace(/^- (.+)$/gm, "<li class='ml-4 list-disc'>$1</li>")
    .replace(/\n\n/g, "</p><p class='mb-2'>")
    .replace(/\n/g, "<br/>");
}

// ─── Message bubble ───────────────────────────────────────────────────────────
function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming?: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center mr-2 mt-1 shrink-0">
          <Sparkles size={13} className="text-blue-600" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white rounded-tr-sm"
            : "bg-zinc-100 text-zinc-800 rounded-tl-sm"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div
            className="prose-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
          />
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-zinc-400 ml-1 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ preset, onExample }: { preset: string; onExample: (q: string) => void }) {
  const examples: Record<string, string[]> = {
    "battle-card": [
      "Researcha Klarna",
      "Gör en battle card på Visma",
      "Förbered mig inför möte med iZettle",
    ],
    "market-research": [
      "Analysera Spotify som bolag",
      "Vad vet du om Northvolt?",
      "Ge mig en marknadsanalys på Bambora",
    ],
    competitive: [
      "Konkurrensutsätt Salesforce i Sverige",
      "Hur positionerar sig HubSpot vs Pipedrive?",
      "Vem konkurrerar med Lime Technologies?",
    ],
    innovation: [
      "Hitta innovationsmöjligheter för ett Swedish Match",
      "Vad kan Systembolaget göra annorlunda?",
      "Innovera på Collectors affärsmodell",
    ],
  };

  const currentExamples = examples[preset] ?? examples["battle-card"];

  return (
    <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
        <FlaskConical size={22} className="text-blue-500" />
      </div>
      <h3 className="text-sm font-semibold text-zinc-700 mb-1">Starta en research</h3>
      <p className="text-xs text-zinc-400 mb-6 max-w-xs">
        Skriv ett företagsnamn så hämtar jag live-data och analyserar det åt dig.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-sm">
        {currentExamples.map((ex) => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            className="text-xs text-left px-3 py-2 rounded-xl border border-zinc-200 hover:border-blue-300 hover:bg-blue-50 text-zinc-600 hover:text-blue-700 transition-all"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Preset dropdown ──────────────────────────────────────────────────────────
function PresetDropdown({
  selectedId,
  onChange,
}: {
  selectedId: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = PROMPT_PRESETS.find((p) => p.id === selectedId) ?? PROMPT_PRESETS[0];

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 hover:border-zinc-300 bg-white text-zinc-700 transition-all"
      >
        <span>{selected.label}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 left-0 w-56 bg-white border border-zinc-200 rounded-xl shadow-lg z-50 py-1.5 overflow-hidden">
          {PROMPT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => { onChange(preset.id); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-zinc-50 ${
                preset.id === selectedId ? "bg-blue-50 text-blue-700" : "text-zinc-700"
              }`}
            >
              <p className="font-semibold">{preset.label}</p>
              <p className="text-zinc-400 mt-0.5">{preset.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export function ResearchView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("battle-card");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const extractCompanyName = (text: string): string | undefined => {
    // Simple extraction: look for company-like words after common triggers
    const match = text.match(
      /(?:researcha|analysera|battle card|möte med|kolla|titta på|om)\s+([A-ZÅÄÖ][a-zåäö]+(?:\s+[A-ZÅÄÖ]?[a-zåäö]+)*)/i
    );
    return match?.[1] ?? text.trim().split(/\s+/).slice(-1)[0];
  };

  const sendMessage = useCallback(
    async (userText: string) => {
      if (!userText.trim() || isStreaming) return;

      const userMsg: ChatMessage = { role: "user", content: userText.trim() };
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      setInput("");
      setIsStreaming(true);

      // Add placeholder for assistant response
      const assistantPlaceholder: ChatMessage = { role: "model", content: "" };
      setMessages([...updatedMessages, assistantPlaceholder]);

      try {
        const isFirst = messages.length === 0;
        const companyName = isFirst ? extractCompanyName(userText) : undefined;

        const res = await fetch("/api/chat/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: updatedMessages,
            presetId: selectedPreset,
            companyName,
          }),
        });

        if (!res.body) throw new Error("No response body");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";
        let apiError: string | null = null;

        outer: while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

          for (const line of lines) {
            const data = line.replace("data: ", "");
            if (data === "[DONE]") break outer;

            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                apiError = parsed.error;
                break outer;
              }
              if (parsed.text) {
                fullText += parsed.text;
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: "model", content: fullText };
                  return next;
                });
              }
            } catch {
              // ignore JSON parse errors on partial chunks
            }
          }
        }

        if (apiError) throw new Error(apiError);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Något gick fel";
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "model", content: `⚠️ ${errMsg}` };
          return next;
        });
      } finally {
        setIsStreaming(false);
        inputRef.current?.focus();
      }
    },
    [messages, isStreaming, selectedPreset]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const reset = () => {
    setMessages([]);
    setInput("");
    setIsStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center">
            <FlaskConical size={16} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-800">Sales Research</h1>
            <p className="text-xs text-zinc-400">AI-driven företagsanalys med live data</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-all"
            >
              <RotateCcw size={12} />
              <span>Ny research</span>
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <EmptyState preset={selectedPreset} onExample={(q) => sendMessage(q)} />
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble
                key={i}
                message={msg}
                isStreaming={isStreaming && i === messages.length - 1 && msg.role === "model"}
              />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-6 py-4 border-t border-zinc-200 bg-zinc-50">
        <div className="flex items-end gap-3 bg-white border border-zinc-200 rounded-2xl px-4 py-3 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all shadow-sm">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              messages.length === 0
                ? "Skriv ett företagsnamn, t.ex. 'Researcha Klarna'..."
                : "Skriv en följdfråga..."
            }
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-zinc-800 placeholder-zinc-400 outline-none leading-relaxed max-h-32"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
            }}
            disabled={isStreaming}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-200 flex items-center justify-center transition-colors shrink-0"
          >
            {isStreaming ? (
              <Loader2 size={14} className="text-white animate-spin" />
            ) : (
              <Send size={14} className="text-white" />
            )}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <PresetDropdown selectedId={selectedPreset} onChange={setSelectedPreset} />
          <p className="text-[10px] text-zinc-400">Enter för att skicka · Shift+Enter för ny rad</p>
        </div>
      </div>
    </div>
  );
}
