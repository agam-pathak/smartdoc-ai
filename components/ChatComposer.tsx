"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

import type { IndexedDocument } from "@/lib/types";

type SearchMode = "document" | "all";

type ChatComposerProps = {
  question: string;
  searchMode: SearchMode;
  selectedDocument: IndexedDocument | null;
  canAskQuestion: boolean;
  blockedReason?: string;
  helperText?: string;
  loading: boolean;
  conversationError: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

const MIN_HEIGHT = 52;
const MAX_HEIGHT = 192;

export default function ChatComposer({
  question,
  searchMode,
  selectedDocument,
  canAskQuestion,
  blockedReason = "",
  helperText = "",
  loading,
  conversationError,
  onQuestionChange,
  onSend,
  onKeyDown,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, MIN_HEIGHT), MAX_HEIGHT);
    el.style.height = `${next}px`;
  }, []);

  // Re-measure whenever the question value changes (including clear-on-send)
  useEffect(() => {
    autoResize();
  }, [question, autoResize]);

  return (
    <div className="border-t border-white/[0.06] bg-[rgba(6,8,16,0.6)] px-4 py-3">
      <div className="flex items-center gap-2 pb-2 text-[10px] text-slate-500">
        <Sparkles className="h-3 w-3 text-cyan-400/50" />
        <span>↵ Enter sends</span>
        <span className="text-white/10">|</span>
        <span>⇧ Shift + Enter adds a line</span>
      </div>

      <div className="relative flex items-end rounded-2xl border border-white/[0.08] bg-white/[0.03] pr-2 transition-colors focus-within:border-cyan-400/30 focus-within:bg-white/[0.04]">
        <textarea
          data-testid="chat-input"
          ref={textareaRef}
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            blockedReason
              ? blockedReason
              : searchMode === "all"
              ? "Ask Lexora AI across your indexed documents..."
              : selectedDocument
                ? `Ask Lexora AI about this document...`
                : "Upload or select a document to enable chat."
          }
          disabled={!canAskQuestion || loading}
          rows={1}
          className="min-h-[52px] flex-1 resize-none overflow-y-auto bg-transparent px-5 py-3.5 text-[15px] leading-7 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60 transition-[height] duration-100 ease-out"
          style={{ height: MIN_HEIGHT }}
        />

        <button
          data-testid="chat-send"
          type="button"
          onClick={onSend}
          disabled={!canAskQuestion || loading || !question.trim()}
          className="m-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          Answers stay constrained to retrieved evidence and can route citation
          clicks back into the viewer.
        </span>
      </div>

      {conversationError ? (
        <p className="mt-2 text-xs text-rose-400">{conversationError}</p>
      ) : helperText ? (
        <p className="mt-2 text-xs text-emerald-300/80">{helperText}</p>
      ) : blockedReason ? (
        <p className="mt-2 text-xs text-cyan-300/80">{blockedReason}</p>
      ) : null}
    </div>
  );
}
