import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";

import type { ChatSource } from "@/lib/types";

type MessageBubbleProps = {
  role: "user" | "assistant";
  text: string;
  sources?: ChatSource[];
  highlight?: boolean;
  onSourceSelect?: (source: ChatSource) => void;
  onFollowUpClick?: (prompt: string) => void;
};

function formatPageRange(pageStart: number, pageEnd: number) {
  return pageStart === pageEnd ? `p.${pageStart}` : `pp.${pageStart}-${pageEnd}`;
}

export default function MessageBubble({
  role,
  text,
  sources = [],
  highlight = false,
  onSourceSelect,
  onFollowUpClick,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const [hoveredSourceIndex, setHoveredSourceIndex] = useState<number | null>(null);

  // Extract followups
  let mainText = text;
  let followups: string[] = [];

  const [isPlaying, setIsPlaying] = useState(false);

  const toggleAudio = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }

    const textToSpeak = mainText.replace(/\[\d+\]/g, "");
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => setIsPlaying(false);
    utterance.rate = 1.05;
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  const followupsMatch = text.match(/<followups>([\s\S]*?)<\/followups>/);
  if (followupsMatch) {
    mainText = text.replace(followupsMatch[0], "").trim();
    followups = followupsMatch[1]
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.includes("<followups>"));
  } else {
    const partialMatch = text.match(/<followups>([^<]*)$/);
    if (partialMatch) {
      mainText = text.substring(0, partialMatch.index).trim();
    }
  }

  const markdownText = mainText.replace(/(\[\d+\])/g, " $1 ");

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-md rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-400/10 px-4 py-3 text-sm text-slate-100">
          <div className="whitespace-pre-wrap">{mainText}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Source cards ── */}
      {sources.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <Search className="h-3 w-3" />
            Sources &amp; Citations:
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
            {sources.map((source, index) => (
              <button
                key={`${source.documentId}-${source.chunkIndex}-${index}`}
                type="button"
                onClick={() => onSourceSelect?.(source)}
                onMouseEnter={() => setHoveredSourceIndex(index)}
                onMouseLeave={() => setHoveredSourceIndex(null)}
                className={`flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-left transition ${
                  hoveredSourceIndex === index
                    ? "border-cyan-400/30 bg-cyan-400/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:border-white/10"
                }`}
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-400/20 text-[9px] font-bold text-cyan-300">
                  {index + 1}
                </span>
                <div className="min-w-0 max-w-[180px]">
                  <div className="flex items-center gap-1.5">
                    <span className="block truncate text-[11px] font-medium text-slate-300">
                      {formatPageRange(source.pageStart, source.pageEnd)}
                    </span>
                    {source.documentRank ? (
                      <span className="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-slate-500">
                        #{source.documentRank}
                      </span>
                    ) : null}
                  </div>
                  <span className="line-clamp-2 text-[10px] leading-snug text-slate-500">
                    {source.excerpt}
                  </span>
                  {source.documentHitCount ? (
                    <span className="mt-1 block text-[9px] uppercase tracking-wider text-slate-600">
                      {source.documentHitCount} hits in doc
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Main answer ── */}
      <div className="text-sm leading-relaxed text-slate-200">
        <ReactMarkdown
          components={{
            p: ({ children }: { children?: React.ReactNode }) => <p className="mb-3 last:mb-0">{children}</p>,
            ul: ({ children }: { children?: React.ReactNode }) => <ul className="mb-3 ml-4 list-disc space-y-1 text-slate-300">{children}</ul>,
            ol: ({ children }: { children?: React.ReactNode }) => <ol className="mb-3 ml-4 list-decimal space-y-1 text-slate-300">{children}</ol>,
            li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
            h1: ({ children }: { children?: React.ReactNode }) => <h1 className="mb-2 mt-4 text-base font-bold text-white">{children}</h1>,
            h2: ({ children }: { children?: React.ReactNode }) => <h2 className="mb-2 mt-3 text-sm font-bold text-white">{children}</h2>,
            h3: ({ children }: { children?: React.ReactNode }) => <h3 className="mb-2 mt-3 text-sm font-bold text-white">{children}</h3>,
            strong: ({ children }: { children?: React.ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
            code: ({ children }: { children?: React.ReactNode }) => <code className="rounded bg-slate-800/60 px-1.5 py-0.5 text-xs font-medium text-cyan-200">{children}</code>,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            text: ({ node }: any) => {
              const val = node.value;
              const parts = val.split(/(\[\d+\])/g);
              if (parts.length === 1) return val;

              return (
                <>
                  {parts.map((part: string, index: number) => {
                    const match = part.match(/\[(\d+)\]/);
                    if (match) {
                      const sourceIndex = parseInt(match[1], 10) - 1;
                      if (sourceIndex >= 0 && sourceIndex < sources.length) {
                        return (
                          <button
                            key={index}
                            className={`inline-flex translate-y-[-1px] items-center justify-center mx-0.5 rounded px-1 py-0 text-[10px] font-bold leading-none transition ${
                              hoveredSourceIndex === sourceIndex
                                ? "bg-cyan-400 text-slate-900"
                                : "bg-cyan-400/20 text-cyan-300 hover:bg-cyan-400/40"
                            }`}
                            onMouseEnter={() => setHoveredSourceIndex(sourceIndex)}
                            onMouseLeave={() => setHoveredSourceIndex(null)}
                            onClick={() => onSourceSelect?.(sources[sourceIndex])}
                            title={sources[sourceIndex].source}
                          >
                            {sourceIndex + 1}
                          </button>
                        );
                      }
                    }
                    return <span key={index}>{part}</span>;
                  })}
                </>
              );
            },
          }}
        >
          {markdownText}
        </ReactMarkdown>
      </div>

      {/* ── Grounding Flow ── */}
      {sources.length > 0 && highlight && (
        <details className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-medium text-slate-400 transition hover:text-cyan-300 [&>svg]:transition-transform [&[open]>svg]:rotate-90 list-none">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            Grounding & Response Flow
          </summary>
          <div className="space-y-2 border-t border-white/[0.04] px-3 py-3">
            <div className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="mt-0.5 font-mono text-cyan-400/80">1.</span>
              Retrieved the closest document chunks for the current question
            </div>
            <div className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="mt-0.5 font-mono text-cyan-400/80">2.</span>
              Carried recent thread context forward when available
            </div>
            <div className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="mt-0.5 font-mono text-cyan-400/80">3.</span>
              Synthesized the answer across {sources.length} retrieved chunks
            </div>
            <div className="flex items-start gap-2 text-[11px] text-slate-400">
              <span className="mt-0.5 font-mono text-cyan-400/80">4.</span>
              Formulated response with explicit source citations
            </div>
          </div>
        </details>
      )}

      {/* ── Listen button ── */}
      {highlight && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={toggleAudio}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-medium transition border ${
              isPlaying
                ? "bg-cyan-400/10 text-cyan-300 border-cyan-400/20"
                : "bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white"
            }`}
          >
            {isPlaying ? "⏸ Pause" : "🔊 Listen"}
          </button>
        </div>
      )}

      {/* ── Follow-up suggestions ── */}
      {followups.length > 0 && highlight ? (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            <ArrowUpRight className="h-3 w-3 text-cyan-400/60" />
            Related
          </div>
          <div className="flex flex-col items-start gap-1.5">
            {followups.map((question, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onFollowUpClick?.(question)}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] text-slate-300 transition hover:border-cyan-400/20 hover:bg-cyan-400/5 hover:text-cyan-200 text-left"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
