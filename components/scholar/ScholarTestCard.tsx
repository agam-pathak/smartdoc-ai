"use client";

import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, ShieldCheck, Target } from "lucide-react";

import type { ScholarMockTest } from "@/lib/scholar/schema";
import type { ScholarPerformanceSubmission } from "@/lib/scholar/performance";

type ScholarTestCardProps = {
  test: ScholarMockTest;
};

type AnswerMap = Record<string, string>;

function getOptionTone({
  selected,
  correct,
  revealed,
}: {
  selected: boolean;
  correct: boolean;
  revealed: boolean;
}) {
  if (!revealed) {
    return selected
      ? "border-amber-300/35 bg-amber-300/12 text-white"
      : "border-white/[0.08] bg-white/[0.03] text-slate-300 hover:border-white/14 hover:bg-white/[0.05]";
  }

  if (correct) {
    return "border-emerald-300/28 bg-emerald-400/10 text-emerald-100";
  }

  if (selected) {
    return "border-rose-300/22 bg-rose-400/10 text-rose-100";
  }

  return "border-white/[0.06] bg-white/[0.02] text-slate-400";
}

export default function ScholarTestCard({ test }: ScholarTestCardProps) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [revealed, setRevealed] = useState(false);
  const [submissionState, setSubmissionState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [submissionError, setSubmissionError] = useState("");
  const startedAtRef = useRef(Date.now());
  const answerTimesRef = useRef<Record<string, number>>({});

  const answeredCount = useMemo(
    () =>
      test.questions.filter((question) => typeof answers[question.id] === "string")
        .length,
    [answers, test.questions],
  );
  const correctCount = useMemo(
    () =>
      test.questions.filter(
        (question) => answers[question.id] === question.correctOptionId,
      ).length,
    [answers, test.questions],
  );

  function handleSelect(questionId: string, optionId: string) {
    if (revealed) {
      return;
    }

    if (typeof answerTimesRef.current[questionId] !== "number") {
      answerTimesRef.current[questionId] = Math.max(
        0,
        Date.now() - startedAtRef.current,
      );
    }

    setAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }));
  }

  function handleReset() {
    setAnswers({});
    setRevealed(false);

    if (submissionState !== "saved") {
      setSubmissionState("idle");
      setSubmissionError("");
      startedAtRef.current = Date.now();
      answerTimesRef.current = {};
    }
  }

  function resolveOptionText(
    options: ScholarMockTest["questions"][number]["options"],
    optionId: string | undefined,
  ) {
    if (!optionId) {
      return null;
    }

    const option = options.find((entry) => entry.id === optionId);
    return option?.text ?? optionId;
  }

  async function persistPerformance() {
    if (submissionState === "saving" || submissionState === "saved") {
      return;
    }

    const payload: ScholarPerformanceSubmission = {
      topic: test.topic,
      totalScore: correctCount,
      questions: test.questions.map((question) => {
        const selectedOptionId = answers[question.id];

        return {
          questionId: question.id,
          userAnswer: resolveOptionText(question.options, selectedOptionId),
          correctAnswer:
            resolveOptionText(question.options, question.correctOptionId) ??
            question.correctOptionId,
          timeTakenMs: answerTimesRef.current[question.id] ?? 0,
          isCorrect: selectedOptionId === question.correctOptionId,
          subjectTag: question.subjectTag,
        };
      }),
    };

    setSubmissionState("saving");
    setSubmissionError("");

    try {
      const response = await fetch("/api/scholar/performance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save scholar performance.");
      }

      setSubmissionState("saved");
    } catch (error) {
      setSubmissionState("error");
      setSubmissionError(
        error instanceof Error
          ? error.message
          : "Unable to save scholar performance.",
      );
    }
  }

  async function handleReveal() {
    setRevealed(true);
    await persistPerformance();
  }

  return (
    <div className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.9),rgba(8,12,20,0.84))] p-4 shadow-[0_24px_80px_rgba(2,8,23,0.28)] backdrop-blur-xl sm:p-5">
      <div className="flex flex-col gap-4 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/18 bg-amber-300/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-100/80">
            Lexora Scholar Mock
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">{test.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-400">{test.coverageSummary}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[240px]">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <Target className="h-3 w-3 text-amber-300/70" />
              Topic
            </div>
            <p className="mt-1 text-sm font-medium text-white">{test.topic}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <Clock3 className="h-3 w-3 text-amber-300/70" />
              Time
            </div>
            <p className="mt-1 text-sm font-medium text-white">{test.estimatedTimeMinutes} min</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr),260px]">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
              Instructions
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-300">
              {test.instructions.map((instruction) => (
                <li key={instruction} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-amber-300/70" />
                  <span>{instruction}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            {test.questions.map((question, questionIndex) => {
              const selectedOptionId = answers[question.id];
              const questionAnswered = typeof selectedOptionId === "string";
              const questionCorrect = selectedOptionId === question.correctOptionId;

              return (
                <div
                  key={question.id}
                  className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        <span>Question {questionIndex + 1}</span>
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[9px] text-slate-400">
                          {question.subjectTag}
                        </span>
                        <span className="rounded-full border border-amber-300/14 bg-amber-300/8 px-2 py-0.5 text-[9px] text-amber-100/80">
                          {question.difficulty}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-7 text-white">{question.question}</p>
                    </div>

                    <div className="rounded-full border border-white/[0.08] bg-slate-950/35 px-3 py-1 text-[10px] text-slate-400">
                      Context {question.sourceContextIds.join(", ")}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2">
                    {question.options.map((option) => {
                      const selected = option.id === selectedOptionId;
                      const correct = option.id === question.correctOptionId;

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handleSelect(question.id, option.id)}
                          className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${getOptionTone({
                            selected,
                            correct,
                            revealed,
                          })}`}
                        >
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-950/35 text-[11px] font-semibold">
                            {option.id}
                          </span>
                          <span className="text-sm leading-6">{option.text}</span>
                        </button>
                      );
                    })}
                  </div>

                  {revealed ? (
                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-slate-950/35 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                            questionCorrect
                              ? "bg-emerald-400/10 text-emerald-200"
                              : questionAnswered
                                ? "bg-rose-400/10 text-rose-200"
                                : "bg-amber-300/10 text-amber-100"
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {questionCorrect
                            ? "Correct"
                            : questionAnswered
                              ? "Incorrect"
                              : "Unanswered"}
                        </span>
                        <span className="text-slate-500">
                          Correct option: {question.correctOptionId}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-slate-300">
                        {question.explanation}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <aside className="space-y-3">
          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300/70" />
              Session Meter
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Progress</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {answeredCount}/{test.questions.length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Difficulty</p>
                <p className="mt-1 text-lg font-semibold capitalize text-white">{test.difficulty}</p>
              </div>
              {revealed ? (
                <div className="rounded-2xl border border-emerald-300/14 bg-emerald-400/6 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-emerald-100/75">Score</p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {correctCount}/{test.questions.length}
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/[0.06] bg-white/[0.03] px-4 py-4">
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleReveal()}
                disabled={revealed}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F59E0B,#F97316)] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
                {revealed ? "Answers revealed" : "Check answers"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
              >
                <RotateCcw className="h-4 w-4" />
                Reset test
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3 text-xs">
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Tracking status
              </p>
              <p className="mt-1 text-slate-300">
                {submissionState === "saved"
                  ? "Performance saved for analytics."
                  : submissionState === "saving"
                    ? "Saving this attempt..."
                    : submissionState === "error"
                      ? submissionError || "Saving failed."
                      : "Results will be saved when you check answers."}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
