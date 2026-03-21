export type ScholarQuestionOption = {
  id: string;
  text: string;
};

export type ScholarQuestion = {
  id: string;
  question: string;
  options: ScholarQuestionOption[];
  correctOptionId: string;
  explanation: string;
  subjectTag: string;
  difficulty: "easy" | "medium" | "hard";
  sourceContextIds: number[];
};

export type ScholarMockTest = {
  title: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard" | "mixed";
  instructions: string[];
  estimatedTimeMinutes: number;
  coverageSummary: string;
  questions: ScholarQuestion[];
};

type JsonRecord = Record<string, unknown>;

const ALLOWED_TEST_DIFFICULTIES = new Set(["easy", "medium", "hard", "mixed"]);
const ALLOWED_QUESTION_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

export const SCHOLAR_TEST_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "topic",
    "difficulty",
    "instructions",
    "estimatedTimeMinutes",
    "coverageSummary",
    "questions",
  ],
  properties: {
    title: {
      type: "string",
      minLength: 3,
    },
    topic: {
      type: "string",
      minLength: 3,
    },
    difficulty: {
      type: "string",
      enum: ["easy", "medium", "hard", "mixed"],
    },
    instructions: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: {
        type: "string",
        minLength: 3,
      },
    },
    estimatedTimeMinutes: {
      type: "integer",
      minimum: 1,
      maximum: 240,
    },
    coverageSummary: {
      type: "string",
      minLength: 10,
    },
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "question",
          "options",
          "correctOptionId",
          "explanation",
          "subjectTag",
          "difficulty",
          "sourceContextIds",
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
          },
          question: {
            type: "string",
            minLength: 10,
          },
          options: {
            type: "array",
            minItems: 4,
            maxItems: 6,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "text"],
              properties: {
                id: {
                  type: "string",
                  minLength: 1,
                },
                text: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
          },
          correctOptionId: {
            type: "string",
            minLength: 1,
          },
          explanation: {
            type: "string",
            minLength: 10,
          },
          subjectTag: {
            type: "string",
            minLength: 2,
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
          },
          sourceContextIds: {
            type: "array",
            minItems: 1,
            items: {
              type: "integer",
              minimum: 1,
            },
          },
        },
      },
    },
  },
} as const;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function readStringWithAliases(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = readString(record, key);

    if (value) {
      return value;
    }
  }

  return "";
}

function readStringArray(record: JsonRecord, key: string) {
  const value = record[key];

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readNumberWithAliases(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

function normalizeOptionId(value: string, index: number) {
  const trimmed = value.trim();

  if (trimmed) {
    return trimmed;
  }

  return String.fromCharCode(65 + index);
}

function normalizeQuestionDifficulty(value: string) {
  return ALLOWED_QUESTION_DIFFICULTIES.has(value) ? (value as ScholarQuestion["difficulty"]) : "medium";
}

function normalizeTestDifficulty(value: string) {
  return ALLOWED_TEST_DIFFICULTIES.has(value)
    ? (value as ScholarMockTest["difficulty"])
    : "mixed";
}

function normalizeSourceContextIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = value
    .map((entry) => (typeof entry === "number" ? Math.trunc(entry) : null))
    .filter((entry): entry is number => entry !== null && Number.isFinite(entry) && entry > 0);

  return [...new Set(ids)];
}

function normalizeOptions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index): ScholarQuestionOption | null => {
      if (typeof entry === "string") {
        const text = entry.trim();
        return text ? { id: normalizeOptionId("", index), text } : null;
      }

      if (!isRecord(entry)) {
        return null;
      }

      const text = readStringWithAliases(entry, ["text", "label", "value"]);

      if (!text) {
        return null;
      }

      return {
        id: normalizeOptionId(readString(entry, "id"), index),
        text,
      };
    })
    .filter((entry): entry is ScholarQuestionOption => entry !== null);
}

function resolveCorrectOptionId(record: JsonRecord, options: ScholarQuestionOption[]) {
  const candidate = readStringWithAliases(record, [
    "correctOptionId",
    "correct_option_id",
    "correctAnswer",
    "correct_answer",
  ]);

  if (!candidate) {
    return "";
  }

  const exactOption = options.find((option) => option.id === candidate);

  if (exactOption) {
    return exactOption.id;
  }

  const matchingText = options.find(
    (option) => option.text.toLowerCase() === candidate.toLowerCase(),
  );

  if (matchingText) {
    return matchingText.id;
  }

  const matchingLetter = options.find(
    (option) => option.id.toLowerCase() === candidate.toLowerCase(),
  );

  return matchingLetter?.id ?? "";
}

function normalizeQuestion(record: JsonRecord, index: number): ScholarQuestion | null {
  const question = readStringWithAliases(record, ["question", "prompt"]);
  const options = normalizeOptions(record.options);
  const correctOptionId = resolveCorrectOptionId(record, options);
  const explanation = readString(record, "explanation");
  const subjectTag = readStringWithAliases(record, ["subjectTag", "subject_tag"]);
  const difficulty = normalizeQuestionDifficulty(
    readString(record, "difficulty").toLowerCase(),
  );
  const sourceContextIds = normalizeSourceContextIds(
    record.sourceContextIds ?? record.source_context_ids,
  );

  if (
    !question ||
    options.length < 4 ||
    !correctOptionId ||
    !explanation ||
    !subjectTag ||
    sourceContextIds.length === 0
  ) {
    return null;
  }

  return {
    id: readString(record, "id") || `q${index + 1}`,
    question,
    options,
    correctOptionId,
    explanation,
    subjectTag,
    difficulty,
    sourceContextIds,
  };
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    const objectMatch = text.match(/\{[\s\S]*\}/);

    if (!objectMatch) {
      throw new Error("Groq did not return valid JSON.");
    }

    return JSON.parse(objectMatch[0]) as unknown;
  }
}

export function parseScholarMockTest(payload: unknown): ScholarMockTest {
  const rawPayload =
    typeof payload === "string" ? tryParseJson(payload) : payload;

  if (!isRecord(rawPayload)) {
    throw new Error("Structured scholar test payload must be a JSON object.");
  }

  const instructions = readStringArray(rawPayload, "instructions");
  const questionsValue = rawPayload.questions;
  const questions = Array.isArray(questionsValue)
    ? questionsValue
        .map((entry, index) => (isRecord(entry) ? normalizeQuestion(entry, index) : null))
        .filter((entry): entry is ScholarQuestion => entry !== null)
    : [];

  const normalized: ScholarMockTest = {
    title: readString(rawPayload, "title"),
    topic: readString(rawPayload, "topic"),
    difficulty: normalizeTestDifficulty(readString(rawPayload, "difficulty").toLowerCase()),
    instructions,
    estimatedTimeMinutes: Math.max(
      1,
      Math.min(
        240,
        Math.trunc(
          readNumberWithAliases(rawPayload, [
            "estimatedTimeMinutes",
            "estimated_time_minutes",
          ]) ?? Math.max(questions.length * 2, 10),
        ),
      ),
    ),
    coverageSummary: readStringWithAliases(rawPayload, [
      "coverageSummary",
      "coverage_summary",
    ]),
    questions,
  };

  if (
    !normalized.title ||
    !normalized.topic ||
    normalized.instructions.length === 0 ||
    !normalized.coverageSummary ||
    normalized.questions.length === 0
  ) {
    throw new Error("Structured scholar test payload is missing required fields.");
  }

  return normalized;
}
