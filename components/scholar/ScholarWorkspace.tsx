"use client";

import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BookOpenText,
  BrainCircuit,
  GraduationCap,
  Landmark,
  LayoutGrid,
  LineChart,
  ShieldCheck,
} from "lucide-react";

import MessageBubble from "@/components/MessageBubble";
import TypingIndicator, { type TypingStep } from "@/components/TypingIndicator";
import WorkspaceModeSwitch from "@/components/WorkspaceModeSwitch";
import type { ChatSource } from "@/lib/types";
import { parseScholarMockTest, type ScholarMockTest } from "@/lib/scholar/schema";

import ScholarComposer from "./ScholarComposer";
import ScholarMessageBubble from "./ScholarMessageBubble";
import ScholarSectionTabs from "./ScholarSectionTabs";

type ScholarWorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  markdown: string;
  createdAt: string;
  sources?: ChatSource[];
  test?: ScholarMockTest;
};

const scholarPromptChips = [
  "Give me 5 hard questions on Modern History.",
  "Create a mixed UPSC prelims test on Indian Polity and Governance.",
  "Generate 8 banking aptitude questions on Data Interpretation.",
  "Make a mini test on Environment and Ecology from previous year patterns.",
] as const;

const scholarThinkingSteps: TypingStep[] = [
  { text: "Interpreting exam scope", icon: BrainCircuit },
  { text: "Searching PYQ knowledge base", icon: BookOpenText },
  { text: "Aligning syllabus patterns", icon: GraduationCap },
  { text: "Rendering the mock test", icon: LayoutGrid },
];

function createIntroMessage(): ScholarWorkspaceMessage {
  return {
    id: "scholar-intro",
    role: "assistant",
    createdAt: new Date(0).toISOString(),
    markdown: [
      "## Scholar workspace online",
      "",
      "Ask for topic-specific mock tests grounded in the global PYQ and syllabus knowledge base.",
      "",
      "- UPSC CSE prelims and mains framing",
      "- Banking aptitude and reasoning drills",
      "- Interactive MCQ rendering with explanations",
    ].join("\n"),
  };
}

function buildScholarSummary(test: ScholarMockTest, sourceCount: number) {
  return [
    `## ${test.title}`,
    "",
    test.coverageSummary,
    "",
    `- Topic: ${test.topic}`,
    `- Difficulty: ${test.difficulty}`,
    `- Questions: ${test.questions.length}`,
    `- Estimated time: ${test.estimatedTimeMinutes} minutes`,
    `- Retrieved scholar contexts: ${sourceCount}`,
  ].join("\n");
}

export default function ScholarWorkspace() {
  const [mobilePane, setMobilePane] = useState<"brief" | "chat">("chat");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ScholarWorkspaceMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);

  const displayedMessages = useMemo(
    () => (messages.length > 0 ? messages : [createIntroMessage()]),
    [messages],
  );
  const latestTest = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant" && message.test)?.test ?? null,
    [messages],
  );

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [displayedMessages, loading]);

  async function sendPrompt(prefilledPrompt?: string) {
    const nextPrompt = (prefilledPrompt ?? prompt).trim();

    if (!nextPrompt || loading) {
      return;
    }

    const userMessage: ScholarWorkspaceMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      markdown: nextPrompt,
      createdAt: new Date().toISOString(),
    };

    setMessages((currentMessages) => [...currentMessages, userMessage]);
    setPrompt("");
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/scholar/generate-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: nextPrompt,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to generate the scholar mock test.");
      }

      const test = parseScholarMockTest(data.test);
      const sources = Array.isArray(data.sources) ? (data.sources as ChatSource[]) : [];

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          markdown: buildScholarSummary(test, sources.length),
          createdAt: new Date().toISOString(),
          test,
          sources,
        },
      ]);
      setMobilePane("chat");
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "The scholar mock test could not be generated.";

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          markdown: message,
          createdAt: new Date().toISOString(),
        },
      ]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendPrompt();
    }
  }

  function clearSession() {
    setMessages([]);
    setPrompt("");
    setError("");
  }

  return (
    <div className="flex h-full flex-col gap-4 px-4 py-4 sm:px-5">
      <WorkspaceModeSwitch />
      <ScholarSectionTabs />

      <div className="border-b border-white/[0.06] px-1 py-1 xl:hidden">
        <div className="inline-flex items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => setMobilePane("brief")}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              mobilePane === "brief"
                ? "bg-white/[0.08] text-white"
                : "text-slate-400"
            }`}
          >
            Brief
          </button>
          <button
            type="button"
            onClick={() => setMobilePane("chat")}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              mobilePane === "chat"
                ? "bg-white/[0.08] text-white"
                : "text-slate-400"
            }`}
          >
            Chat
          </button>
        </div>
      </div>

      <div className="grid flex-1 min-h-0 gap-4 xl:grid-cols-[340px,minmax(0,1fr)]">
        <aside
          className={`${
            mobilePane === "brief" ? "flex" : "hidden"
          } min-h-0 flex-col gap-4 xl:flex`}
        >
          <div className="rounded-[32px] border border-white/[0.08] bg-[linear-gradient(160deg,rgba(31,41,55,0.9),rgba(17,24,39,0.78))] p-5 shadow-[0_24px_90px_rgba(2,8,23,0.26)]">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/18 bg-amber-300/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/80">
              Scholar brief
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
              Exam-mode workspace for topic-accurate drilling.
            </h1>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Generate format-aware mock tests from a global PYQ and syllabus corpus without crossing into private PDF space.
            </p>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/70" />
              Retrieval scope
            </div>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-xs font-medium text-white">Global exam knowledge base</p>
                <p className="mt-1 text-xs leading-6 text-slate-400">
                  Previous year questions, syllabus fragments, and exam-pattern retrieval.
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-xs font-medium text-white">Interactive rendering</p>
                <p className="mt-1 text-xs leading-6 text-slate-400">
                  Multiple-choice options, answer checks, and explanation review in the same thread.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <LineChart className="h-3.5 w-3.5 text-amber-300/70" />
              Recommended asks
            </div>
            <div className="mt-3 flex flex-col gap-2">
              {scholarPromptChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setPrompt(chip)}
                  className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3 text-left text-sm text-slate-300 transition hover:border-amber-300/20 hover:bg-amber-300/5 hover:text-white"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <Landmark className="h-3.5 w-3.5 text-cyan-300/70" />
              Current session
            </div>
            <div className="mt-3 space-y-3">
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Messages</p>
                <p className="mt-1 text-lg font-semibold text-white">{messages.length}</p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Latest topic</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {latestTest?.topic ?? "Awaiting first mock"}
                </p>
              </div>
              <button
                type="button"
                onClick={clearSession}
                className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                Clear scholar thread
              </button>
            </div>
          </div>
        </aside>

        <section
          className={`${
            mobilePane === "chat" ? "flex" : "hidden"
          } min-h-0 flex-col overflow-hidden rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(12,18,30,0.88),rgba(8,12,20,0.8))] shadow-[0_30px_110px_rgba(2,8,23,0.32)] xl:flex`}
        >
          <div className="border-b border-white/[0.06] px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-white">Lexora Scholar</h2>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Exam mode active
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Generate dynamic mock tests from the global scholar corpus and review them inline.
                </p>
              </div>

              {latestTest ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    Active mock
                  </p>
                  <p className="mt-1 text-sm font-medium text-white">{latestTest.title}</p>
                </div>
              ) : null}
            </div>

            {messages.length <= 1 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {scholarPromptChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setPrompt(chip)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[11px] text-slate-400 transition hover:border-amber-300/20 hover:bg-amber-300/5 hover:text-amber-50"
                  >
                    <GraduationCap className="h-3 w-3 text-amber-300/70" />
                    {chip}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative flex-1 min-h-0 overflow-y-auto px-4 py-4">
            <div className="space-y-5">
              {displayedMessages.map((message, index) =>
                message.test ? (
                  <ScholarMessageBubble
                    key={message.id}
                    role={message.role}
                    markdown={message.markdown}
                    sources={message.sources}
                    test={message.test}
                    highlight={
                      index === displayedMessages.length - 1 &&
                      message.role === "assistant"
                    }
                  />
                ) : (
                  <MessageBubble
                    key={message.id}
                    role={message.role}
                    text={message.markdown}
                    sources={message.sources}
                    highlight={
                      index === displayedMessages.length - 1 &&
                      message.role === "assistant"
                    }
                  />
                ),
              )}

              {loading ? (
                <TypingIndicator
                  title="Scholar Engine"
                  steps={scholarThinkingSteps}
                />
              ) : null}
              <div ref={endOfMessagesRef} />
            </div>
          </div>

          <ScholarComposer
            prompt={prompt}
            loading={loading}
            error={error}
            onPromptChange={setPrompt}
            onSend={() => void sendPrompt()}
            onKeyDown={handleComposerKeyDown}
          />
        </section>
      </div>
    </div>
  );
}
