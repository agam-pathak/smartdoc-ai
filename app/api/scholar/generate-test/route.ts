import { NextResponse } from "next/server";

import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import {
  LOCAL_EMBEDDING_MODEL,
  SCHOLAR_CHAT_MODELS,
  SCHOLAR_EMBEDDING_MODEL,
  SCHOLAR_MATCH_RPC,
  SCHOLAR_NAMESPACE_ID,
  SCHOLAR_TOP_K,
} from "@/lib/scholar/constants";
import { getEdgeSession } from "@/lib/scholar/edge-auth";
import {
  parseScholarMockTest,
  SCHOLAR_TEST_JSON_SCHEMA,
  type ScholarMockTest,
} from "@/lib/scholar/schema";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ScholarChunkRow = {
  id: string;
  document_id: string;
  embedding_model: string;
  chunk_index: number;
  content: string;
  start_offset: number;
  end_offset: number;
  page_start: number;
  page_end: number;
  source: string;
  file_url: string;
  score: number;
};

type ScholarRetrievedChunk = {
  documentId: string;
  embeddingModel: string;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  source: string;
  fileUrl: string;
  score: number;
};

type GroqEmbeddingResponse = {
  data?: Array<{
    index: number;
    embedding: number[];
  }>;
  error?: {
    message?: string;
  };
};

type GroqChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const EMBEDDINGS_PROVIDER = process.env.LEXORA_EMBEDDINGS_PROVIDER ?? "auto";
const REQUESTED_QUESTION_COUNT_PATTERN =
  /\b(?:give|create|generate|make|build)\s+me\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:questions|mcqs|items)\b/i;

const SYSTEM_PROMPT = `You are Lexora Scholar, an assessment generator for high-level competitive exams such as UPSC CSE and banking exams.

You must generate exam-accurate multiple-choice mock questions using only the retrieved PYQ and syllabus context.

Rules:
1. Honor the user's requested topic, exam framing, and difficulty.
2. If the user explicitly requests a number of questions, return exactly that many. Otherwise return 5 questions.
3. Every question must have one correct option only.
4. Explanations must be detailed but concise, grounded in the retrieved context, and suitable for revision.
5. Every question must include at least one valid sourceContextId that points to the retrieved context list.
6. Keep the response strictly in the requested JSON format. Do not wrap the JSON in markdown.`;

function hashToken(value: string, seed = 0) {
  let hash = 2166136261 ^ seed;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    return values.map(() => 0);
  }

  return values.map((value) => value / magnitude);
}

function tokenizeForLocalEmbedding(text: string) {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [];
  }

  const wordTokens = normalized
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((token) => ({
      token: `w:${token}`,
      weight: 1,
    }));

  const charTokens: Array<{ token: string; weight: number }> = [];

  for (let index = 0; index <= normalized.length - 3; index += 1) {
    const trigram = normalized.slice(index, index + 3);

    if (trigram.includes("  ")) {
      continue;
    }

    charTokens.push({
      token: `c:${trigram}`,
      weight: 0.35,
    });
  }

  return [...wordTokens, ...charTokens];
}

function createLocalEmbedding(text: string) {
  const vector = new Array<number>(768).fill(0);

  for (const token of tokenizeForLocalEmbedding(text)) {
    const bucket = hashToken(token.token) % vector.length;
    const direction = hashToken(token.token, 13) % 2 === 0 ? 1 : -1;
    vector[bucket] += token.weight * direction;
  }

  return normalizeVector(vector);
}

function shouldUseLocalFallback(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : "message" in error && typeof error.message === "string"
        ? error.message.toLowerCase()
        : "";

  return (
    message.includes("model") && message.includes("not") && message.includes("support") ||
    message.includes("do not have access") ||
    message.includes("forbidden") ||
    message.includes("connection") ||
    message.includes("timeout")
  );
}

function toSupabaseVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

function formatPageRange(pageStart: number, pageEnd: number) {
  return pageStart === pageEnd
    ? `page ${pageStart}`
    : `pages ${pageStart}-${pageEnd}`;
}

function inferQuestionCount(prompt: string) {
  const match = prompt.match(REQUESTED_QUESTION_COUNT_PATTERN);
  const rawValue = match?.[1] ?? match?.[2] ?? "";
  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return 5;
  }

  return Math.min(parsedValue, 20);
}

function buildContext(chunks: ScholarRetrievedChunk[]) {
  return chunks
    .map(
      (chunk, index) =>
        `Context ${index + 1} (${chunk.source}, ${formatPageRange(
          chunk.pageStart,
          chunk.pageEnd,
        )}, chunk ${chunk.chunkIndex}):\n${chunk.text}`,
    )
    .join("\n\n");
}

function normalizeChunks(rows: ScholarChunkRow[] | null | undefined) {
  return (rows ?? []).map(
    (row): ScholarRetrievedChunk => ({
      documentId: row.document_id,
      embeddingModel: row.embedding_model,
      chunkIndex: row.chunk_index,
      text: row.content,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      source: row.source,
      fileUrl: row.file_url,
      score: row.score,
    }),
  );
}

async function groqRequest<TResponse>(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch(`${GROQ_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json()) as TResponse;

  if (!response.ok) {
    const errorMessage =
      typeof payload === "object" &&
      payload &&
      "error" in payload &&
      payload.error &&
      typeof payload.error === "object" &&
      "message" in payload.error &&
      typeof payload.error.message === "string"
        ? payload.error.message
        : "Groq request failed.";

    throw new Error(errorMessage);
  }

  return payload;
}

async function embedScholarPrompt(prompt: string) {
  if (!process.env.GROQ_API_KEY && EMBEDDINGS_PROVIDER !== "groq") {
    return {
      embedding: createLocalEmbedding(prompt),
      model: LOCAL_EMBEDDING_MODEL,
      provider: "local" as const,
    };
  }

  try {
    const response = await groqRequest<GroqEmbeddingResponse>("/embeddings", {
      model: SCHOLAR_EMBEDDING_MODEL,
      input: [prompt],
      encoding_format: "float",
    });
    const embedding = response.data?.[0]?.embedding;

    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new Error("Groq embeddings returned an empty vector.");
    }

    return {
      embedding: normalizeVector(embedding),
      model: SCHOLAR_EMBEDDING_MODEL,
      provider: "groq" as const,
    };
  } catch (error) {
    if (EMBEDDINGS_PROVIDER === "groq" || !shouldUseLocalFallback(error)) {
      throw error;
    }

    return {
      embedding: createLocalEmbedding(prompt),
      model: LOCAL_EMBEDDING_MODEL,
      provider: "local" as const,
    };
  }
}

async function searchScholarChunks(prompt: string, topK: number) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  const query = await embedScholarPrompt(prompt);
  const { data, error } = await supabase.rpc(SCHOLAR_MATCH_RPC, {
    query_embedding: toSupabaseVectorLiteral(query.embedding),
    filter_user_id: SCHOLAR_NAMESPACE_ID,
    match_count: topK,
    filter_document_id: null,
    filter_document_ids: null,
    filter_embedding_model: query.model,
  });

  if (error) {
    throw error;
  }

  return {
    query,
    chunks: normalizeChunks((data as ScholarChunkRow[] | null) ?? []),
  };
}

async function generateStructuredTest({
  prompt,
  context,
  questionCount,
}: {
  prompt: string;
  context: string;
  questionCount: number;
}) {
  const messages = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: [
        `User request: ${prompt}`,
        `Target question count: ${questionCount}`,
        "Retrieved PYQ and syllabus context:",
        context,
      ].join("\n\n"),
    },
  ];

  let lastError: unknown = null;

  for (const model of SCHOLAR_CHAT_MODELS) {
    try {
      const structuredResponse = await groqRequest<GroqChatResponse>("/chat/completions", {
        model,
        temperature: 0.35,
        messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "lexora_scholar_mock_test",
            description: "Structured mock-test payload for Lexora Scholar.",
            schema: SCHOLAR_TEST_JSON_SCHEMA,
            strict: true,
          },
        },
      });
      const content = structuredResponse.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Groq returned an empty structured response.");
      }

      return {
        model,
        responseFormat: "json_schema" as const,
        test: parseScholarMockTest(content),
      };
    } catch (error) {
      lastError = error;
    }

    try {
      const jsonModeResponse = await groqRequest<GroqChatResponse>("/chat/completions", {
        model,
        temperature: 0.35,
        messages: [
          ...messages,
          {
            role: "user",
            content: "Return only a valid JSON object with the requested fields. Do not include markdown fences.",
          },
        ],
        response_format: {
          type: "json_object",
        },
      });
      const content = jsonModeResponse.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("Groq returned an empty JSON-mode response.");
      }

      return {
        model,
        responseFormat: "json_object" as const,
        test: parseScholarMockTest(content),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Groq could not generate a scholar mock test.");
}

function buildSources(chunks: ScholarRetrievedChunk[]) {
  return chunks.map((chunk) => ({
    documentId: chunk.documentId,
    source: chunk.source,
    fileUrl: chunk.fileUrl,
    chunkIndex: chunk.chunkIndex,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    score: Number(chunk.score.toFixed(4)),
    excerpt: chunk.text.slice(0, 240).trim(),
  }));
}

function attachQuestionCountFallback(test: ScholarMockTest, prompt: string) {
  const requestedQuestionCount = inferQuestionCount(prompt);

  if (test.questions.length === requestedQuestionCount) {
    return test;
  }

  if (test.questions.length > requestedQuestionCount) {
    return {
      ...test,
      questions: test.questions.slice(0, requestedQuestionCount),
    };
  }

  return test;
}

export async function POST(request: Request) {
  try {
    const session = await getEdgeSession(request);

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json(
        { error: "Supabase search is not configured for Lexora Scholar." },
        { status: 503 },
      );
    }

    const body = await request.json();
    const prompt =
      typeof body.prompt === "string"
        ? body.prompt.trim()
        : typeof body.question === "string"
          ? body.question.trim()
          : "";
    const requestedCount =
      typeof body.questionCount === "number" && Number.isFinite(body.questionCount)
        ? Math.max(1, Math.min(Math.trunc(body.questionCount), 20))
        : inferQuestionCount(prompt);
    const topK =
      typeof body.topK === "number" && Number.isFinite(body.topK)
        ? Math.max(4, Math.min(Math.trunc(body.topK), 12))
        : SCHOLAR_TOP_K;

    if (!prompt) {
      return NextResponse.json(
        { error: "A scholar prompt is required." },
        { status: 400 },
      );
    }

    const { query, chunks } = await searchScholarChunks(prompt, topK);

    if (chunks.length === 0) {
      return NextResponse.json(
        {
          error: "No relevant PYQ or syllabus context was found in the scholar knowledge base.",
          sources: [],
        },
        { status: 404 },
      );
    }

    const generation = await generateStructuredTest({
      prompt,
      context: buildContext(chunks),
      questionCount: requestedCount,
    });
    const test = attachQuestionCountFallback(generation.test, prompt);

    return NextResponse.json({
      prompt,
      test,
      sources: buildSources(chunks),
      retrieval: {
        namespace: SCHOLAR_NAMESPACE_ID,
        topK,
        matches: chunks.length,
        embeddingModel: query.model,
        embeddingProvider: query.provider,
      },
      generation: {
        model: generation.model,
        responseFormat: generation.responseFormat,
      },
      user: {
        id: session.userId,
      },
    });
  } catch (error) {
    console.error("Scholar generate-test route error:", error);

    return NextResponse.json(
      { error: "The scholar mock test could not be generated." },
      { status: 500 },
    );
  }
}
