"use client";

import { ArrowUp, Sparkles } from "lucide-react";

type ScholarComposerProps = {
  prompt: string;
  loading: boolean;
  error: string;
  onPromptChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export default function ScholarComposer({
  prompt,
  loading,
  error,
  onPromptChange,
  onSend,
  onKeyDown,
}: ScholarComposerProps) {
  return (
    <div className="border-t border-white/[0.06] bg-[rgba(6,8,16,0.66)] px-4 py-3">
      <div className="flex items-center gap-2 pb-2 text-[10px] text-slate-500">
        <Sparkles className="h-3 w-3 text-amber-300/60" />
        <span>↵ Enter generates a test</span>
        <span className="text-white/10">|</span>
        <span>⇧ Shift + Enter adds a line</span>
      </div>

      <div className="relative flex items-end rounded-xl border border-white/[0.08] bg-white/[0.03] pr-1.5 transition-colors focus-within:border-amber-300/30 focus-within:bg-white/[0.04]">
        <textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask for a format-accurate mock test, for example: Give me 5 hard questions on Modern History."
          disabled={loading}
          rows={1}
          className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-6 text-slate-100 outline-none placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onSend}
          disabled={loading || !prompt.trim()}
          className="m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#F59E0B,#F97316)] text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-30 disabled:grayscale"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2 text-[10px] text-slate-500">
        Mock tests are grounded in the global PYQ and syllabus knowledge base and rendered below as interactive MCQs.
      </div>

      {error ? <p className="mt-2 text-xs text-rose-400">{error}</p> : null}
    </div>
  );
}
