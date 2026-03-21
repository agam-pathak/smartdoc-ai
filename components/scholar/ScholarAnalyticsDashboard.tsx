"use client";

import Link from "next/link";
import {
  startTransition,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Target,
  TrendingUp,
} from "lucide-react";

import {
  EMPTY_SCHOLAR_PERFORMANCE,
  type ScholarPerformanceResponse,
  type ScholarSubjectPerformance,
} from "@/lib/scholar/performance";

function toneForSubject(subject: ScholarSubjectPerformance) {
  if (subject.strength === "weak") {
    return {
      rail: "bg-rose-400/12",
      bar: "bg-[linear-gradient(90deg,rgba(251,113,133,0.82),rgba(244,63,94,0.92))]",
      badge: "bg-rose-400/10 text-rose-200",
    };
  }

  if (subject.strength === "strong") {
    return {
      rail: "bg-emerald-400/12",
      bar: "bg-[linear-gradient(90deg,rgba(52,211,153,0.82),rgba(16,185,129,0.92))]",
      badge: "bg-emerald-400/10 text-emerald-200",
    };
  }

  return {
    rail: "bg-cyan-400/12",
    bar: "bg-[linear-gradient(90deg,rgba(56,189,248,0.82),rgba(59,130,246,0.92))]",
    badge: "bg-cyan-400/10 text-cyan-100",
  };
}

function SummaryCard({
  label,
  value,
  meta,
  icon: Icon,
}: {
  label: string;
  value: string;
  meta: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] px-4 py-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-amber-300/70" />
        {label}
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{meta}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-[24px] border border-white/[0.06] bg-white/[0.03]"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),360px]">
        <div className="h-[440px] rounded-[28px] border border-white/[0.06] bg-white/[0.03]" />
        <div className="space-y-4">
          <div className="h-[212px] rounded-[28px] border border-white/[0.06] bg-white/[0.03]" />
          <div className="h-[212px] rounded-[28px] border border-white/[0.06] bg-white/[0.03]" />
        </div>
      </div>
    </div>
  );
}

export default function ScholarAnalyticsDashboard() {
  const [data, setData] = useState<ScholarPerformanceResponse>(EMPTY_SCHOLAR_PERFORMANCE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnalytics() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/scholar/performance", {
          cache: "no-store",
        });
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.error || "Unable to load scholar analytics.",
          );
        }

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setData(payload as ScholarPerformanceResponse);
        });
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load scholar analytics.",
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const maxQuestions = useMemo(
    () =>
      Math.max(
        1,
        ...data.subjects.map((subject) => subject.totalQuestions),
      ),
    [data.subjects],
  );
  const maxTrendQuestions = useMemo(
    () =>
      Math.max(1, ...data.trend.map((point) => point.questionCount)),
    [data.trend],
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-rose-400/14 bg-rose-400/6 px-5 py-5">
        <div className="flex items-center gap-2 text-sm font-medium text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      </div>
    );
  }

  if (data.summary.totalQuestions === 0) {
    return (
      <div className="rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-6 py-8 text-center shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-300/10 text-amber-100">
          <BarChart3 className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-white">
          No scholar performance yet
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-400">
          Generate a mock test in Scholar Workspace and check your answers once to start building subject-level analytics.
        </p>
        <div className="mt-6">
          <Link
            href="/scholar"
            className="inline-flex items-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#F59E0B,#F97316)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110"
          >
            Open mock lab
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Tracked Accuracy"
          value={`${data.summary.averageAccuracy}%`}
          meta={`${data.summary.totalCorrect} correct of ${data.summary.totalQuestions}`}
          icon={Target}
        />
        <SummaryCard
          label="Mock Sessions"
          value={String(data.summary.totalSessions)}
          meta={`Average score ${data.summary.averageScore}`}
          icon={BrainCircuit}
        />
        <SummaryCard
          label="Tracked Subjects"
          value={String(data.summary.trackedSubjects)}
          meta="Subject strength map"
          icon={TrendingUp}
        />
        <SummaryCard
          label="Last Activity"
          value={
            data.summary.lastActivityAt
              ? new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(data.summary.lastActivityAt))
              : "N/A"
          }
          meta="Most recent saved attempt"
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr),360px]">
        <section className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-5 py-5 shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Subject performance
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Weak and strong subjects at a glance
              </h2>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
              {data.subjects.length} subjects
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {data.subjects.map((subject) => {
              const tone = toneForSubject(subject);
              const questionWidth = `${(subject.totalQuestions / maxQuestions) * 100}%`;

              return (
                <div
                  key={subject.subject}
                  className="rounded-[22px] border border-white/[0.06] bg-white/[0.03] px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-white">{subject.subject}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] ${tone.badge}`}>
                          {subject.strength}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {subject.correctQuestions} correct · {subject.incorrectQuestions} incorrect · {subject.avgTimeSeconds}s avg
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-white">{subject.accuracy}%</p>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        {subject.totalQuestions} questions
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className={`h-2.5 rounded-full ${tone.rail}`}>
                      <div
                        className={`h-full rounded-full ${tone.bar}`}
                        style={{ width: `${Math.max(subject.accuracy, 6)}%` }}
                      />
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.04]">
                      <div
                        className="h-full rounded-full bg-white/[0.2]"
                        style={{ width: questionWidth }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          <section className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-5 py-5 shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Weak zone
            </p>
            <div className="mt-4 space-y-3">
              {data.weakSubjects.length > 0 ? (
                data.weakSubjects.map((subject) => (
                  <div
                    key={subject.subject}
                    className="rounded-[22px] border border-rose-400/10 bg-rose-400/6 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{subject.subject}</p>
                      <span className="text-sm font-semibold text-rose-200">
                        {subject.accuracy}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-rose-100/70">
                      {subject.incorrectQuestions} misses across {subject.totalQuestions} attempts
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">
                  No clear weak cluster yet.
                </p>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-5 py-5 shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Strong zone
            </p>
            <div className="mt-4 space-y-3">
              {data.strongSubjects.length > 0 ? (
                data.strongSubjects.map((subject) => (
                  <div
                    key={subject.subject}
                    className="rounded-[22px] border border-emerald-400/10 bg-emerald-400/6 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{subject.subject}</p>
                      <span className="text-sm font-semibold text-emerald-200">
                        {subject.accuracy}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-emerald-100/70">
                      {subject.correctQuestions} strong hits across {subject.totalQuestions} attempts
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-400">
                  No strong cluster yet.
                </p>
              )}
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr),minmax(0,1fr)]">
        <section className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-5 py-5 shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Session trend
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Recent mock momentum
              </h2>
            </div>
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-400">
              Last {data.trend.length}
            </div>
          </div>

          <div className="mt-6 flex min-h-[260px] items-end gap-3">
            {data.trend.map((point) => (
              <div key={`${point.date}-${point.topic}`} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                <div className="flex h-52 w-full items-end justify-center rounded-[24px] border border-white/[0.06] bg-white/[0.02] px-2 py-2">
                  <div
                    className="w-full rounded-[18px] bg-[linear-gradient(180deg,rgba(250,204,21,0.9),rgba(249,115,22,0.9))]"
                    style={{
                      height: `${Math.max((point.questionCount / maxTrendQuestions) * 100, 20)}%`,
                      opacity: Math.max(point.accuracy / 100, 0.35),
                    }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">{point.accuracy}%</p>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                    {point.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,24,39,0.88),rgba(8,12,20,0.82))] px-5 py-5 shadow-[0_24px_90px_rgba(2,8,23,0.24)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">
                Recent sessions
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                Latest saved attempts
              </h2>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-300/70" />
          </div>

          <div className="mt-5 space-y-3">
            {data.recentSessions.map((session) => (
              <div
                key={session.id}
                className="rounded-[22px] border border-white/[0.06] bg-white/[0.03] px-4 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{session.topic}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      }).format(new Date(session.createdAt))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-white">{session.accuracy}%</p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                      {session.correctCount}/{session.questionCount}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Score</p>
                    <p className="mt-1 text-sm font-medium text-white">{session.totalScore}</p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Weakest</p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {session.weakestSubject ?? "N/A"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-slate-950/35 px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Strongest</p>
                    <p className="mt-1 text-sm font-medium text-white">
                      {session.strongestSubject ?? "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
