import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  EMPTY_SCHOLAR_PERFORMANCE,
  type ScholarPerformanceResponse,
  type ScholarPerformanceSubmission,
  type ScholarPerformanceSubmissionQuestion,
  type ScholarRecentSession,
  type ScholarSubjectPerformance,
  type ScholarTrendPoint,
} from "@/lib/scholar/performance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const USER_MOCK_SESSIONS_TABLE = "user_mock_sessions";
const USER_QUESTION_LOGS_TABLE = "user_question_logs";

type UserMockSessionRow = {
  id: string;
  user_id: string;
  topic: string;
  total_score: number | string;
  created_at: string;
};

type UserQuestionLogRow = {
  id: string;
  session_id: string;
  question_id: string;
  user_answer: string | null;
  correct_answer: string;
  time_taken_ms: number;
  is_correct: boolean;
  subject_tag: string;
  created_at: string;
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeQuestionPayload(value: unknown): ScholarPerformanceSubmissionQuestion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const questionId =
    typeof record.questionId === "string" ? record.questionId.trim() : "";
  const correctAnswer =
    typeof record.correctAnswer === "string" ? record.correctAnswer.trim() : "";
  const subjectTag =
    typeof record.subjectTag === "string" ? record.subjectTag.trim() : "";
  const userAnswer =
    typeof record.userAnswer === "string" && record.userAnswer.trim()
      ? record.userAnswer.trim()
      : null;
  const isCorrect = Boolean(record.isCorrect);
  const timeTakenMs =
    typeof record.timeTakenMs === "number" && Number.isFinite(record.timeTakenMs)
      ? Math.max(0, Math.trunc(record.timeTakenMs))
      : 0;

  if (!questionId || !correctAnswer || !subjectTag) {
    return null;
  }

  return {
    questionId,
    userAnswer,
    correctAnswer,
    timeTakenMs,
    isCorrect,
    subjectTag,
  };
}

function normalizeSubmissionPayload(value: unknown): ScholarPerformanceSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const topic = typeof record.topic === "string" ? record.topic.trim() : "";
  const totalScore =
    typeof record.totalScore === "number" && Number.isFinite(record.totalScore)
      ? record.totalScore
      : null;
  const questions = Array.isArray(record.questions)
    ? record.questions
        .map((question) => normalizeQuestionPayload(question))
        .filter((question): question is ScholarPerformanceSubmissionQuestion => question !== null)
    : [];

  if (!topic || totalScore === null || questions.length === 0) {
    return null;
  }

  return {
    topic,
    totalScore,
    questions,
  };
}

function classifyStrength(accuracy: number, totalQuestions: number): ScholarSubjectPerformance["strength"] {
  if (accuracy < 55 || (totalQuestions >= 4 && accuracy < 62)) {
    return "weak";
  }

  if (accuracy >= 75 && totalQuestions >= 2) {
    return "strong";
  }

  return "steady";
}

function buildPerformanceResponse(
  sessions: UserMockSessionRow[],
  logs: UserQuestionLogRow[],
): ScholarPerformanceResponse {
  if (sessions.length === 0 || logs.length === 0) {
    return {
      ...EMPTY_SCHOLAR_PERFORMANCE,
      summary: {
        ...EMPTY_SCHOLAR_PERFORMANCE.summary,
        totalSessions: sessions.length,
        averageScore:
          sessions.length > 0
            ? round(
                sessions.reduce(
                  (sum, session) => sum + Number(session.total_score || 0),
                  0,
                ) / sessions.length,
                2,
              )
            : 0,
        lastActivityAt: sessions[0]?.created_at ?? null,
      },
    };
  }

  const sessionLogsMap = new Map<string, UserQuestionLogRow[]>();
  const subjectMap = new Map<
    string,
    {
      totalQuestions: number;
      correctQuestions: number;
      totalTimeMs: number;
      lastSeenAt: string;
    }
  >();

  for (const log of logs) {
    const currentSessionLogs = sessionLogsMap.get(log.session_id) ?? [];
    currentSessionLogs.push(log);
    sessionLogsMap.set(log.session_id, currentSessionLogs);

    const currentSubject = subjectMap.get(log.subject_tag) ?? {
      totalQuestions: 0,
      correctQuestions: 0,
      totalTimeMs: 0,
      lastSeenAt: log.created_at,
    };

    currentSubject.totalQuestions += 1;
    currentSubject.correctQuestions += log.is_correct ? 1 : 0;
    currentSubject.totalTimeMs += log.time_taken_ms;
    if (Date.parse(log.created_at) > Date.parse(currentSubject.lastSeenAt)) {
      currentSubject.lastSeenAt = log.created_at;
    }
    subjectMap.set(log.subject_tag, currentSubject);
  }

  const subjects: ScholarSubjectPerformance[] = [...subjectMap.entries()]
    .map(([subject, stats]) => {
      const incorrectQuestions = stats.totalQuestions - stats.correctQuestions;
      const accuracy = round((stats.correctQuestions / stats.totalQuestions) * 100, 1);

      return {
        subject,
        totalQuestions: stats.totalQuestions,
        correctQuestions: stats.correctQuestions,
        incorrectQuestions,
        accuracy,
        avgTimeSeconds: round(stats.totalTimeMs / stats.totalQuestions / 1000, 1),
        strength: classifyStrength(accuracy, stats.totalQuestions),
        lastSeenAt: stats.lastSeenAt,
      };
    })
    .sort(
      (left, right) =>
        left.accuracy - right.accuracy ||
        right.totalQuestions - left.totalQuestions ||
        left.subject.localeCompare(right.subject),
    );

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  const recentSessions: ScholarRecentSession[] = sessions.slice(0, 10).map((session) => {
    const sessionLogs = sessionLogsMap.get(session.id) ?? [];
    const questionCount = sessionLogs.length;
    const correctCount = sessionLogs.filter((log) => log.is_correct).length;
    const accuracy =
      questionCount > 0 ? round((correctCount / questionCount) * 100, 1) : 0;

    const subjectStats = new Map<
      string,
      {
        total: number;
        correct: number;
      }
    >();

    for (const log of sessionLogs) {
      const current = subjectStats.get(log.subject_tag) ?? { total: 0, correct: 0 };
      current.total += 1;
      current.correct += log.is_correct ? 1 : 0;
      subjectStats.set(log.subject_tag, current);
    }

    const rankedSubjects = [...subjectStats.entries()]
      .map(([subject, stats]) => ({
        subject,
        accuracy: stats.total > 0 ? stats.correct / stats.total : 0,
      }))
      .sort((left, right) => left.accuracy - right.accuracy);

    return {
      id: session.id,
      topic: session.topic,
      createdAt: session.created_at,
      totalScore: Number(session.total_score || 0),
      questionCount,
      correctCount,
      accuracy,
      weakestSubject: rankedSubjects[0]?.subject ?? null,
      strongestSubject: rankedSubjects[rankedSubjects.length - 1]?.subject ?? null,
    };
  });

  const trend: ScholarTrendPoint[] = sessions
    .slice(0, 8)
    .reverse()
    .map((session) => {
      const sessionLogs = sessionLogsMap.get(session.id) ?? [];
      const questionCount = sessionLogs.length;
      const correctCount = sessionLogs.filter((log) => log.is_correct).length;

      return {
        date: session.created_at,
        label: formatter.format(new Date(session.created_at)),
        topic: session.topic,
        accuracy:
          questionCount > 0 ? round((correctCount / questionCount) * 100, 1) : 0,
        totalScore: Number(session.total_score || 0),
        questionCount,
      };
    });

  const totalQuestions = logs.length;
  const totalCorrect = logs.filter((log) => log.is_correct).length;
  const totalScore = sessions.reduce(
    (sum, session) => sum + Number(session.total_score || 0),
    0,
  );

  return {
    summary: {
      totalSessions: sessions.length,
      totalQuestions,
      totalCorrect,
      averageAccuracy: round((totalCorrect / totalQuestions) * 100, 1),
      averageScore: round(totalScore / sessions.length, 2),
      trackedSubjects: subjects.length,
      lastActivityAt: sessions[0]?.created_at ?? null,
    },
    subjects,
    weakSubjects: subjects.filter((subject) => subject.strength === "weak").slice(0, 5),
    strongSubjects: [...subjects]
      .filter((subject) => subject.strength === "strong")
      .sort((left, right) => right.accuracy - left.accuracy)
      .slice(0, 5),
    trend,
    recentSessions,
  };
}

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase performance tracking is not configured." },
        { status: 503 },
      );
    }

    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase performance tracking is not configured." },
        { status: 503 },
      );
    }

    const { data: sessionsData, error: sessionsError } = await supabase
      .from(USER_MOCK_SESSIONS_TABLE)
      .select("id, user_id, topic, total_score, created_at")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (sessionsError) {
      throw sessionsError;
    }

    const sessions = (sessionsData as UserMockSessionRow[] | null) ?? [];

    if (sessions.length === 0) {
      return NextResponse.json(EMPTY_SCHOLAR_PERFORMANCE);
    }

    const sessionIds = sessions.map((item) => item.id);
    const { data: logsData, error: logsError } = await supabase
      .from(USER_QUESTION_LOGS_TABLE)
      .select(
        "id, session_id, question_id, user_answer, correct_answer, time_taken_ms, is_correct, subject_tag, created_at",
      )
      .in("session_id", sessionIds)
      .limit(5000);

    if (logsError) {
      throw logsError;
    }

    const logs = (logsData as UserQuestionLogRow[] | null) ?? [];
    return NextResponse.json(buildPerformanceResponse(sessions, logs));
  } catch (error) {
    console.error("Scholar performance GET route error:", error);

    return NextResponse.json(
      { error: "The scholar performance dashboard could not be loaded." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase performance tracking is not configured." },
        { status: 503 },
      );
    }

    const supabase = getSupabaseAdminClient();

    if (!supabase) {
      return NextResponse.json(
        { error: "Supabase performance tracking is not configured." },
        { status: 503 },
      );
    }

    const payload = normalizeSubmissionPayload(await request.json());

    if (!payload) {
      return NextResponse.json(
        { error: "A valid scholar performance payload is required." },
        { status: 400 },
      );
    }

    const { data: createdSession, error: sessionInsertError } = await supabase
      .from(USER_MOCK_SESSIONS_TABLE)
      .insert({
        user_id: session.userId,
        topic: payload.topic,
        total_score: payload.totalScore,
      })
      .select("id, user_id, topic, total_score, created_at")
      .single();

    if (sessionInsertError) {
      throw sessionInsertError;
    }

    const createdSessionRow = createdSession as UserMockSessionRow;
    const questionRows = payload.questions.map((question) => ({
      session_id: createdSessionRow.id,
      question_id: question.questionId,
      user_answer: question.userAnswer,
      correct_answer: question.correctAnswer,
      time_taken_ms: question.timeTakenMs,
      is_correct: question.isCorrect,
      subject_tag: question.subjectTag,
    }));

    const { error: logInsertError } = await supabase
      .from(USER_QUESTION_LOGS_TABLE)
      .insert(questionRows);

    if (logInsertError) {
      throw logInsertError;
    }

    return NextResponse.json({
      sessionId: createdSessionRow.id,
      topic: createdSessionRow.topic,
      totalScore: Number(createdSessionRow.total_score || 0),
      questionCount: questionRows.length,
    });
  } catch (error) {
    console.error("Scholar performance POST route error:", error);

    return NextResponse.json(
      { error: "The scholar mock performance could not be saved." },
      { status: 500 },
    );
  }
}
