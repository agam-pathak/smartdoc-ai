export type ScholarPerformanceSubmissionQuestion = {
  questionId: string;
  userAnswer: string | null;
  correctAnswer: string;
  timeTakenMs: number;
  isCorrect: boolean;
  subjectTag: string;
};

export type ScholarPerformanceSubmission = {
  topic: string;
  totalScore: number;
  questions: ScholarPerformanceSubmissionQuestion[];
};

export type ScholarSubjectPerformance = {
  subject: string;
  totalQuestions: number;
  correctQuestions: number;
  incorrectQuestions: number;
  accuracy: number;
  avgTimeSeconds: number;
  strength: "weak" | "steady" | "strong";
  lastSeenAt: string;
};

export type ScholarRecentSession = {
  id: string;
  topic: string;
  createdAt: string;
  totalScore: number;
  questionCount: number;
  correctCount: number;
  accuracy: number;
  weakestSubject: string | null;
  strongestSubject: string | null;
};

export type ScholarTrendPoint = {
  date: string;
  label: string;
  topic: string;
  accuracy: number;
  totalScore: number;
  questionCount: number;
};

export type ScholarPerformanceSummary = {
  totalSessions: number;
  totalQuestions: number;
  totalCorrect: number;
  averageAccuracy: number;
  averageScore: number;
  trackedSubjects: number;
  lastActivityAt: string | null;
};

export type ScholarPerformanceResponse = {
  summary: ScholarPerformanceSummary;
  subjects: ScholarSubjectPerformance[];
  weakSubjects: ScholarSubjectPerformance[];
  strongSubjects: ScholarSubjectPerformance[];
  trend: ScholarTrendPoint[];
  recentSessions: ScholarRecentSession[];
};

export const EMPTY_SCHOLAR_PERFORMANCE: ScholarPerformanceResponse = {
  summary: {
    totalSessions: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    averageAccuracy: 0,
    averageScore: 0,
    trackedSubjects: 0,
    lastActivityAt: null,
  },
  subjects: [],
  weakSubjects: [],
  strongSubjects: [],
  trend: [],
  recentSessions: [],
};
