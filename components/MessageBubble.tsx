import { Bot, FileText, UserRound, ArrowUpRight, Search } from "lucide-react";
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

    // Clean text by stripping inline reference brackets like [1] before speaking
    const textToSpeak = mainText.replace(/\[\d+\]/g, "");
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.onend = () => setIsPlaying(false);
    utterance.rate = 1.05; // Slightly faster, natural pacing
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
    // Hide incomplete streaming tags
    const partialMatch = text.match(/<followups>([^<]*)$/);
    if (partialMatch) {
      mainText = text.substring(0, partialMatch.index).trim();
    }
  }

  // Parse inline citations like [1] out of mainText to wrap them
  const markdownText = mainText.replace(/(\[\d+\])/g, " $1 ");

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start w-full"}`}>
      {!isUser && sources.length > 0 ? (
        <div className="mb-4 mt-2 w-full max-w-4xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Search className="h-4 w-4" />
            Sources
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden">
            {sources.map((source, index) => (
              <button
                key={`${source.documentId}-${source.chunkIndex}-${index}`}
                type="button"
                onClick={() => onSourceSelect?.(source)}
                onMouseEnter={() => setHoveredSourceIndex(index)}
                onMouseLeave={() => setHoveredSourceIndex(null)}
                className={`flex w-[160px] shrink-0 flex-col gap-1.5 rounded-[20px] border p-3 text-left transition-all ${
                  hoveredSourceIndex === index
                    ? "border-cyan-300/50 bg-cyan-300/10 shadow-[0_0_15px_rgba(103,232,249,0.15)]"
                    : "border-white/10 bg-slate-950/40 hover:border-cyan-300/30 hover:bg-slate-900/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold text-slate-300 ring-1 ring-white/10">
                    {index + 1}
                  </span>
                  <span className="truncate font-medium text-slate-300" title={source.source}>
                    {source.source}
                  </span>
                </div>
                <div className="line-clamp-2 text-[11px] leading-snug text-slate-400">
                  {source.excerpt}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className={`max-w-3xl rounded-[28px] px-5 py-5 transition sm:px-6 shadow-md ${
          isUser
            ? "bg-gradient-to-br from-cyan-300 via-sky-400 to-sky-500 text-slate-950"
            : highlight
              ? "border border-cyan-300/18 bg-[linear-gradient(145deg,rgba(34,57,83,0.76),rgba(14,27,45,0.9))] text-slate-100"
              : "border border-white/10 bg-white/[0.06] text-slate-100 backdrop-blur-xl"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-60">
            {isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            <span>{isUser ? "You" : "Answer"}</span>
          </div>
          
          {!isUser && highlight && (
            <button 
              onClick={toggleAudio}
              className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition border ${
                isPlaying 
                  ? "bg-cyan-300/20 text-cyan-200 border-cyan-300/30 animate-pulse" 
                  : "bg-white/5 border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              {isPlaying ? "Pause" : "Listen"}
            </button>
          )}
        </div>

        {!isUser && sources.length > 0 && (
          <details className="mb-4">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-cyan-300 transition-colors flex items-center gap-2 list-none marker:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-zap text-cyan-400"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>View agentic thinking steps</span>
            </summary>
            <div className="mt-2 pl-6 border-l-2 border-white/10 text-xs text-slate-500 space-y-2">
              <div className="flex items-center gap-2"><span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse"></span> Parsed user query intent.</div>
              <div className="flex items-center gap-2"><span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse delay-75"></span> Retrieved {sources.length} relevant chunks from the vector index.</div>
              <div className="flex items-center gap-2"><span className="block h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse delay-150"></span> Cross-referencing evidence and synthesizing response.</div>
            </div>
          </details>
        )}

        <div className="text-[15px] leading-relaxed">
          {isUser ? (
            <div className="whitespace-pre-wrap">{mainText}</div>
          ) : (
            <ReactMarkdown
              components={{
                p: ({ children }: any) => <p className="mb-4 last:mb-0">{children}</p>,
                ul: ({ children }: any) => <ul className="mb-4 ml-5 list-disc space-y-1 text-slate-300">{children}</ul>,
                ol: ({ children }: any) => <ol className="mb-4 ml-5 list-decimal space-y-1 text-slate-300">{children}</ol>,
                li: ({ children }: any) => <li>{children}</li>,
                h1: ({ children }: any) => <h1 className="mb-3 mt-5 text-xl font-bold text-white">{children}</h1>,
                h2: ({ children }: any) => <h2 className="mb-3 mt-4 text-lg font-bold text-white">{children}</h2>,
                h3: ({ children }: any) => <h3 className="mb-2 mt-3 font-bold text-white">{children}</h3>,
                strong: ({ children }: any) => <strong className="font-semibold text-white">{children}</strong>,
                code: ({ children }: any) => <code className="rounded bg-slate-950/50 px-1.5 py-0.5 text-sm font-medium text-cyan-200">{children}</code>,
                // Override rendering of text patterns matched as `[1]` to render citations
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
                                className={`inline-flex items-center justify-center translate-y-[-2px] mx-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none transition-colors ${
                                  hoveredSourceIndex === sourceIndex
                                    ? "bg-cyan-300 text-slate-900"
                                    : "bg-cyan-300/20 text-cyan-200 hover:bg-cyan-300/40"
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
                }
              }}
            >
              {markdownText}
            </ReactMarkdown>
          )}
        </div>
      </div>

      {!isUser && followups.length > 0 && highlight ? (
        <div className="mt-6 flex flex-col gap-3 pl-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <ArrowUpRight className="h-4 w-4 text-cyan-200" />
            Related
          </div>
          <div className="flex flex-col items-start gap-2">
            {followups.map((question, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onFollowUpClick?.(question)}
                className="rounded-full border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-cyan-50 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 text-left"
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
