"use client";

import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ALL_DOCUMENTS_SCOPE_ID } from "@/lib/chat-constants";
import type {
  ChatSource,
  ConversationMessage,
  ConversationSummary,
  IndexedDocument,
} from "@/lib/types";

import ChatComposer from "./ChatComposer";
import ChatHeader from "./ChatHeader";
import MessageBubble from "./MessageBubble";
import ThreadHistory from "./ThreadHistory";
import TypingIndicator from "./TypingIndicator";

type SearchMode = "document" | "all";

type ChatBoxProps = {
  documents: IndexedDocument[];
  selectedDocumentId: string;
  onDocumentChange: (documentId: string) => void;
  onSourceSelect?: (source: ChatSource) => void;
};

function createAssistantIntro(
  document: IndexedDocument | null,
  searchMode: SearchMode,
  documentCount: number,
): ConversationMessage {
  if (documentCount === 0) {
    return {
      id: "assistant-intro",
      role: "assistant",
      text: "Upload a PDF to start a grounded conversation.",
      createdAt: new Date(0).toISOString(),
    };
  }

  if (searchMode === "all") {
    return {
      id: "assistant-intro",
      role: "assistant",
      text: `All-documents retrieval is active across ${documentCount} indexed ${
        documentCount === 1 ? "file" : "files"
      }. Keep a viewer document open on the left while answers can cite any source in the library.`,
      createdAt: new Date(0).toISOString(),
    };
  }

  return {
    id: "assistant-intro",
    role: "assistant",
    text: document
      ? document.extractionMode === "ocr-recommended"
        ? `"${document.name}" looks scan-heavy. I can keep it in the workspace, but detailed grounded answers may be limited until OCR is added.`
        : `Ready. Ask about "${document.name}" and I will answer from retrieved evidence only.`
      : "Select a document to start a grounded conversation.",
    createdAt: new Date(0).toISOString(),
  };
}

function createPromptChips(
  document: IndexedDocument | null,
  searchMode: SearchMode,
  documentCount: number,
) {
  if (documentCount === 0) {
    return [];
  }

  if (searchMode === "all") {
    return [
      "Summarize the key ideas across all indexed documents.",
      "Which document contains the strongest evidence for the main topic?",
      "Compare the most important details across the indexed PDFs.",
      "What common themes or repeated entities appear across the library?",
    ];
  }

  if (!document) {
    return [];
  }

  if (document.extractionMode === "ocr-recommended") {
    return [
      `What parts of "${document.name}" appear to be OCR-limited?`,
      "What metadata or visible structure can you still infer from this file?",
      "How should I improve this document before asking detailed questions?",
    ];
  }

  return [
    `Give me a crisp summary of "${document.name}".`,
    "List the most important facts and entities.",
    "What are the strongest highlights in this document?",
    "Which details matter most for decision-making?",
  ];
}

function toMarkdownTranscript(
  conversationTitle: string,
  messages: ConversationMessage[],
) {
  return [
    `# ${conversationTitle}`,
    "",
    ...messages.flatMap((message) => [
      `## ${message.role === "user" ? "User" : "Assistant"}`,
      "",
      message.text,
      "",
    ]),
  ].join("\n");
}

export default function ChatBox({
  documents,
  selectedDocumentId,
  onDocumentChange,
  onSourceSelect,
}: ChatBoxProps) {
  const [searchMode, setSearchMode] = useState<SearchMode>("document");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [conversationSummaries, setConversationSummaries] = useState<
    ConversationSummary[]
  >([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingConversationDetail, setLoadingConversationDetail] =
    useState(false);
  const [conversationError, setConversationError] = useState("");
  const [deletingConversationId, setDeletingConversationId] = useState("");
  const [threadSummary, setThreadSummary] = useState("");
  const [summarizingConversation, setSummarizingConversation] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const selectedConversationIdRef = useRef(selectedConversationId);

  const selectedDocument =
    documents.find((document) => document.id === selectedDocumentId) ?? null;
  const conversationScopeId =
    searchMode === "all"
      ? ALL_DOCUMENTS_SCOPE_ID
      : (selectedDocument?.id ?? "");
  const canAskQuestion =
    searchMode === "all" ? documents.length > 0 : selectedDocument !== null;
  const promptChips = useMemo(
    () => createPromptChips(selectedDocument, searchMode, documents.length),
    [documents.length, searchMode, selectedDocument],
  );
  const displayedMessages = useMemo(
    () =>
      messages.length > 0
        ? messages
        : [
            createAssistantIntro(
              selectedDocument,
              searchMode,
              documents.length,
            ),
          ],
    [documents.length, messages, searchMode, selectedDocument],
  );
  const activeConversation =
    conversationSummaries.find(
      (conversation) => conversation.id === selectedConversationId,
    ) ?? null;

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    setQuestion("");
    setConversationError("");
    setThreadSummary("");
  }, [searchMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversationSummaries() {
      if (!conversationScopeId) {
        setConversationSummaries([]);
        setSelectedConversationId("");
        setMessages([]);
        return;
      }

      setConversationSummaries([]);
      setSelectedConversationId("");
      setMessages([]);
      setLoadingConversations(true);
      setConversationError("");

      try {
        const response = await fetch(
          `/api/conversations?documentId=${encodeURIComponent(conversationScopeId)}`,
          { cache: "no-store" },
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Unable to load conversations.");
        }

        if (cancelled) {
          return;
        }

        const nextSummaries: ConversationSummary[] =
          data.conversations ?? [];
        const nextConversationId =
          nextSummaries.find(
            (conversation) =>
              conversation.id === selectedConversationIdRef.current,
          )?.id ??
          nextSummaries[0]?.id ??
          "";

        setConversationSummaries(nextSummaries);
        setSelectedConversationId(nextConversationId);
        setQuestion("");
        setThreadSummary("");

        if (!nextConversationId) {
          setMessages([]);
          return;
        }

        setLoadingConversationDetail(true);

        const detailResponse = await fetch(
          `/api/conversations/${nextConversationId}`,
          {
            cache: "no-store",
          },
        );
        const detailData = await detailResponse.json();

        if (!detailResponse.ok) {
          throw new Error(
            detailData.error || "Unable to load the conversation.",
          );
        }

        if (!cancelled) {
          setMessages(detailData.conversation?.messages ?? []);
        }
      } catch (error) {
        if (!cancelled) {
          setConversationError(
            error instanceof Error
              ? error.message
              : "Unable to load conversations.",
          );
          setConversationSummaries([]);
          setSelectedConversationId("");
          setMessages([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingConversations(false);
          setLoadingConversationDetail(false);
        }
      }
    }

    void loadConversationSummaries();

    return () => {
      cancelled = true;
    };
  }, [conversationScopeId]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [displayedMessages, loading]);

  async function loadConversationDetail(conversationId: string) {
    setLoadingConversationDetail(true);
    setConversationError("");
    setSelectedConversationId(conversationId);
    setThreadSummary("");

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}`,
        {
          cache: "no-store",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load the conversation.",
        );
      }

      setMessages(data.conversation?.messages ?? []);
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to load the conversation.",
      );
    } finally {
      setLoadingConversationDetail(false);
    }
  }

  async function createNewConversation() {
    if (!conversationScopeId) {
      return;
    }

    setLoadingConversations(true);
    setConversationError("");

    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: conversationScopeId,
          title:
            searchMode === "all"
              ? "All documents thread"
              : `${selectedDocument?.name ?? "Document"} thread`,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create a conversation.",
        );
      }

      const nextConversation: ConversationSummary = data.conversation;
      setConversationSummaries((currentSummaries) => [
        nextConversation,
        ...currentSummaries.filter(
          (conversation) => conversation.id !== nextConversation.id,
        ),
      ]);
      setSelectedConversationId(nextConversation.id);
      setMessages([]);
      setQuestion("");
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to create a conversation.",
      );
    } finally {
      setLoadingConversations(false);
    }
  }

  async function renameConversationById(
    conversationId: string,
    nextTitle: string,
  ) {
    if (!nextTitle.trim()) {
      return;
    }

    setConversationError("");

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: nextTitle.trim(),
          }),
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to rename the conversation.",
        );
      }

      const renamedConversation: ConversationSummary = data.conversation;

      setConversationSummaries((currentSummaries) =>
        currentSummaries.map((conversation) =>
          conversation.id === renamedConversation.id
            ? renamedConversation
            : conversation,
        ),
      );
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to rename the conversation.",
      );
    }
  }

  async function updateConversationPinnedById(
    conversationId: string,
    pinned: boolean,
  ) {
    setConversationError("");

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pinned }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update the thread.");
      }

      const updatedConversation: ConversationSummary = data.conversation;
      setConversationSummaries((currentSummaries) =>
        [
          ...currentSummaries.map((conversation) =>
            conversation.id === updatedConversation.id
              ? updatedConversation
              : conversation,
          ),
        ].sort(
          (left, right) =>
            Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
            Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""),
        ),
      );
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to update the thread.",
      );
    }
  }

  async function duplicateConversationById(conversationId: string) {
    setConversationError("");

    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "duplicate" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to duplicate the conversation.");
      }

      const duplicatedConversation: ConversationSummary = data.conversation;
      setConversationSummaries((currentSummaries) => [
        duplicatedConversation,
        ...currentSummaries.filter(
          (conversation) => conversation.id !== duplicatedConversation.id,
        ),
      ]);
      await loadConversationDetail(duplicatedConversation.id);
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to duplicate the conversation.",
      );
    }
  }

  async function summarizeActiveConversation() {
    if (!selectedConversationId) {
      return;
    }

    setSummarizingConversation(true);
    setConversationError("");

    try {
      const response = await fetch(`/api/conversations/${selectedConversationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "summarize" }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to summarize the conversation.");
      }

      setThreadSummary(typeof data.summary === "string" ? data.summary : "");
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to summarize the conversation.",
      );
    } finally {
      setSummarizingConversation(false);
    }
  }

  function exportActiveConversation() {
    if (!activeConversation || messages.length === 0) {
      return;
    }

    const contents = toMarkdownTranscript(activeConversation.title, messages);
    const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${activeConversation.title.replace(/[^\w-]+/g, "-").toLowerCase() || "thread"}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function deleteConversationById(conversationId: string) {
    setDeletingConversationId(conversationId);
    setConversationError("");

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}`,
        {
          method: "DELETE",
        },
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to delete the conversation.",
        );
      }

      const remainingSummaries = conversationSummaries.filter(
        (conversation) => conversation.id !== conversationId,
      );

      setConversationSummaries(remainingSummaries);

      if (selectedConversationId === conversationId) {
        const nextConversationId = remainingSummaries[0]?.id ?? "";
        setSelectedConversationId(nextConversationId);

        if (nextConversationId) {
          await loadConversationDetail(nextConversationId);
        } else {
          setMessages([]);
        }
      }
    } catch (error) {
      setConversationError(
        error instanceof Error
          ? error.message
          : "Unable to delete the conversation.",
      );
    } finally {
      setDeletingConversationId("");
    }
  }

  async function sendQuestion(prefilledQuestion?: string) {
    const trimmedQuestion = (prefilledQuestion ?? question).trim();

    if (!trimmedQuestion || !canAskQuestion) {
      return;
    }

    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: trimmedQuestion,
      createdAt: new Date().toISOString(),
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setQuestion("");
    setLoading(true);
    setConversationError("");

    const assistantMessageId = `assistant-${Date.now()}`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: trimmedQuestion,
          documentId: selectedDocument?.id ?? "",
          conversationId: selectedConversationId || undefined,
          searchMode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error || "The document question failed.",
        );
      }

      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream") && response.body) {
        // Streaming SSE response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let sseBuffer = "";

        // Add initial assistant message
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: assistantMessageId,
            role: "assistant",
            text: "",
            createdAt: new Date().toISOString(),
          },
        ]);

        let finalSources: ChatSource[] = [];
        let finalConversation: ConversationSummary | undefined;

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          sseBuffer += decoder.decode(value, { stream: true });
          const lines = sseBuffer.split("\n");
          sseBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) {
              continue;
            }

            const payload = line.slice(6).trim();

            if (!payload || payload === "[DONE]") {
              continue;
            }

            try {
              const event = JSON.parse(payload);

              if (event.type === "sources") {
                finalSources = event.sources ?? [];
                
                // Immediately push sources to UI
                setMessages((currentMessages) =>
                  currentMessages.map((message) =>
                    message.id === assistantMessageId
                      ? { ...message, sources: finalSources }
                      : message,
                  ),
                );
              } else if (event.type === "delta") {
                accumulatedText += event.text ?? "";
                
                // Stream text changes
                setMessages((currentMessages) =>
                  currentMessages.map((message) =>
                    message.id === assistantMessageId
                      ? { ...message, text: accumulatedText }
                      : message,
                  ),
                );
              } else if (event.type === "done") {
                finalConversation = event.conversation;
                if (event.answer) {
                  accumulatedText = event.answer;
                }
              }
            } catch {
              // Skip malformed SSE event
            }
          }
        }

        // Final update with sources
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantMessageId
              ? {
                  ...message,
                  text:
                    accumulatedText ||
                    "The information is not available in the document.",
                  sources: finalSources,
                }
              : message,
          ),
        );

        if (finalConversation) {
          setConversationSummaries((currentSummaries) => [
            finalConversation!,
            ...currentSummaries.filter(
              (existingConversation) =>
                existingConversation.id !== finalConversation!.id,
            ),
          ]);
          setSelectedConversationId(finalConversation.id);
        }
      } else {
        // Fallback: regular JSON response
        const data = await response.json();
        const conversation: ConversationSummary | undefined =
          data.conversation;

        if (conversation) {
          setConversationSummaries((currentSummaries) => [
            conversation,
            ...currentSummaries.filter(
              (existingConversation) =>
                existingConversation.id !== conversation.id,
            ),
          ]);
          setSelectedConversationId(conversation.id);
        }

        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: assistantMessageId,
            role: "assistant",
            text:
              data.answer ||
              "The information is not available in the document.",
            sources: data.sources ?? [],
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Something went wrong while asking the document.";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: message,
          createdAt: new Date().toISOString(),
        },
      ]);
      setConversationError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleComposerKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendQuestion();
    }
  }

  return (
    <div className="flex h-full flex-col min-h-0">
      <ChatHeader
        documents={documents}
        selectedDocumentId={selectedDocumentId}
        searchMode={searchMode}
        activeConversation={activeConversation}
        canAskQuestion={canAskQuestion}
        promptChips={promptChips}
        messages={messages}
        summaryText={threadSummary}
        summarizingConversation={summarizingConversation}
        onDocumentChange={onDocumentChange}
        onSearchModeChange={setSearchMode}
        onPromptChipClick={(prompt) => setQuestion(prompt)}
        onSummarizeConversation={() => void summarizeActiveConversation()}
        onExportConversation={exportActiveConversation}
      />

      <ThreadHistory
        conversationSummaries={conversationSummaries}
        selectedConversationId={selectedConversationId}
        loadingConversations={loadingConversations}
        deletingConversationId={deletingConversationId}
        conversationScopeId={conversationScopeId}
        onLoadConversation={(id) => void loadConversationDetail(id)}
        onCreateNew={() => void createNewConversation()}
        onRename={(id, title) => void renameConversationById(id, title)}
        onPin={(id, pinned) => void updateConversationPinnedById(id, pinned)}
        onDuplicate={(id) => void duplicateConversationById(id)}
        onDelete={(id) => void deleteConversationById(id)}
      />

      {/* ── Messages area ── */}
      <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4">
        {loadingConversationDetail ? (
          <div className="pb-3 text-xs text-slate-500">
            Loading thread…
          </div>
        ) : null}

        <div className="space-y-5">
          {displayedMessages.map((message, index) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              text={message.text}
              sources={message.sources}
              highlight={
                index === displayedMessages.length - 1 &&
                message.role === "assistant"
              }
              onSourceSelect={onSourceSelect}
              onFollowUpClick={(prompt) => void sendQuestion(prompt)}
            />
          ))}

          {loading ? <TypingIndicator /> : null}
          <div ref={endOfMessagesRef} />
        </div>
      </div>

      <ChatComposer
        question={question}
        searchMode={searchMode}
        selectedDocument={selectedDocument}
        canAskQuestion={canAskQuestion}
        loading={loading}
        conversationError={conversationError}
        onQuestionChange={setQuestion}
        onSend={() => void sendQuestion()}
        onKeyDown={handleComposerKeyDown}
      />
    </div>
  );
}
