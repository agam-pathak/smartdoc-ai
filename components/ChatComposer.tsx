"use client";

import { ArrowUp, Sparkles } from "lucide-react";

import type { IndexedDocument } from "@/lib/types";

type SearchMode = "document" | "all";

type ChatComposerProps = {
  question: string;
  searchMode: SearchMode;
  selectedDocument: IndexedDocument | null;
  canAskQuestion: boolean;
  loading: boolean;
  conversationError: string;
  onQuestionChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export default function ChatComposer({
  question,
  searchMode,
  selectedDocument,
  canAskQuestion,
  loading,
  conversationError,
  onQuestionChange,
  onSend,
  onKeyDown,
}: ChatComposerProps) {
  return (
    <div className="border-t border-white/[0.06] bg-[rgba(6,8,16,0.6)] px-4 py-3">
      <div className="flex items-center gap-2 pb-2 text-[10px] text-slate-500">
        <Sparkles className="h-3 w-3 text-cyan-400/50" />
        <span>↵ Enter sends</span>
        <span className="text-white/10">|</span>
        <span>⇧ Shift + Enter adds a line</span>
      </div>

      <div className="relative flex items-end rounded-xl border border-white/[0.08] bg-white/[0.03] pr-1.5 transition-colors focus-within:border-cyan-400/30 focus-within:bg-white/[0.04]">
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={
            searchMode === "all"
              ? "Ask Lexora AI across your indexed documents..."
              : selectedDocument
                ? `Ask Lexora AI about this document...`
                : "Upload or select a document to enable chat."
          }
          disabled={!canAskQuestion || loading}
          rows={1}
          className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={!canAskQuestion || loading || !question.trim()}
          className="m-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
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
      ) : null}
    </div>
  );
}
