"use client";

import {
  Check,
  Copy,
  History,
  LoaderCircle,
  PencilLine,
  Pin,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";

import type { ConversationSummary } from "@/lib/types";

type ThreadHistoryProps = {
  conversationSummaries: ConversationSummary[];
  selectedConversationId: string;
  loadingConversations: boolean;
  deletingConversationId: string;
  conversationScopeId: string;
  onLoadConversation: (conversationId: string) => void;
  onCreateNew: () => void;
  onRename: (conversationId: string, currentTitle: string) => void;
  onPin: (conversationId: string, pinned: boolean) => void;
  onDuplicate: (conversationId: string) => void;
  onDelete: (conversationId: string) => void;
};

function formatConversationTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

export default function ThreadHistory({
  conversationSummaries,
  selectedConversationId,
  loadingConversations,
  deletingConversationId,
  conversationScopeId,
  onLoadConversation,
  onCreateNew,
  onRename,
  onPin,
  onDuplicate,
  onDelete,
}: ThreadHistoryProps) {
  const [editingConversationId, setEditingConversationId] = useState("");
  const [draftTitle, setDraftTitle] = useState("");

  if (conversationSummaries.length === 0 && !loadingConversations) {
    return null;
  }

  return (
    <div className="border-b border-white/[0.06] px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
          <History className="h-3 w-3" />
          {conversationSummaries.length} thread{conversationSummaries.length !== 1 ? "s" : ""}
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          disabled={!conversationScopeId || loadingConversations}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          {loadingConversations ? (
            <LoaderCircle className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          New
        </button>
      </div>

      {conversationSummaries.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {conversationSummaries.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              onClick={() => onLoadConversation(conversation.id)}
              className={`group flex min-w-[160px] max-w-[200px] shrink-0 flex-col gap-1 rounded-lg border px-3 py-2 text-left transition ${
                conversation.id === selectedConversationId
                  ? "border-cyan-400/20 bg-cyan-400/[0.06]"
                  : "border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {conversation.pinned ? (
                  <Pin className="h-3 w-3 shrink-0 text-amber-300" />
                ) : null}

                {editingConversationId === conversation.id ? (
                  <input
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && draftTitle.trim()) {
                        event.preventDefault();
                        onRename(conversation.id, draftTitle.trim());
                        setEditingConversationId("");
                        setDraftTitle("");
                      }

                      if (event.key === "Escape") {
                        setEditingConversationId("");
                        setDraftTitle("");
                      }
                    }}
                    className="w-full rounded bg-white/[0.04] px-1.5 py-1 text-[11px] font-medium text-white outline-none ring-1 ring-cyan-400/30"
                    autoFocus
                  />
                ) : (
                  <span className="truncate text-[11px] font-medium text-white">
                    {conversation.title}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[9px] text-slate-500">
                  {formatConversationTime(conversation.updatedAt)} · {conversation.messageCount} msgs
                </span>
                <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                  {editingConversationId === conversation.id ? (
                    <>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!draftTitle.trim()) {
                            return;
                          }

                          onRename(conversation.id, draftTitle.trim());
                          setEditingConversationId("");
                          setDraftTitle("");
                        }}
                        className="rounded p-0.5 text-emerald-300 hover:text-emerald-200"
                      >
                        <Check className="h-3 w-3" />
                      </span>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingConversationId("");
                          setDraftTitle("");
                        }}
                        className="rounded p-0.5 text-slate-500 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onPin(conversation.id, !conversation.pinned);
                        }}
                        className={`rounded p-0.5 ${
                          conversation.pinned
                            ? "text-amber-300 hover:text-amber-200"
                            : "text-slate-500 hover:text-white"
                        }`}
                      >
                        <Pin className="h-3 w-3" />
                      </span>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingConversationId(conversation.id);
                          setDraftTitle(conversation.title);
                        }}
                        className="rounded p-0.5 text-slate-500 hover:text-white"
                      >
                        <PencilLine className="h-3 w-3" />
                      </span>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDuplicate(conversation.id);
                        }}
                        className="rounded p-0.5 text-slate-500 hover:text-white"
                      >
                        <Copy className="h-3 w-3" />
                      </span>
                      <span
                        role="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(conversation.id);
                        }}
                        className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                      >
                        {deletingConversationId === conversation.id ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
