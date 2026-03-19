import Groq from "groq-sdk";

export const CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL ?? "llama-3.1-8b-instant";
export const GROQ_EMBEDDING_MODEL =
  process.env.GROQ_EMBEDDING_MODEL ?? "nomic-embed-text-v1_5";
export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";

const EMBEDDING_BATCH_SIZE = 16;
const LOCAL_EMBEDDING_DIMENSIONS = 768;
const EMBEDDINGS_PROVIDER = process.env.LEXORA_EMBEDDINGS_PROVIDER ?? "auto";

let groqClient: Groq | null = null;
let groqEmbeddingAccess: boolean | null =
  EMBEDDINGS_PROVIDER === "local" ? false : null;
let didLogLocalFallback = false;

type EmbedTextsResult = {
  embeddings: number[][];
  model: string;
};

function toFloatEmbedding(embedding: number[] | string) {
  if (Array.isArray(embedding)) {
    return embedding;
  }

  throw new Error("Expected Groq to return float embeddings.");
}

function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    return values;
  }

  return values.map((value) => value / magnitude);
}

function hashToken(value: string, seed = 0) {
  let hash = 2166136261 ^ seed;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
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
  const vector = new Array<number>(LOCAL_EMBEDDING_DIMENSIONS).fill(0);

  for (const token of tokenizeForLocalEmbedding(text)) {
    const bucket = hashToken(token.token) % LOCAL_EMBEDDING_DIMENSIONS;
    const direction = hashToken(token.token, 13) % 2 === 0 ? 1 : -1;
    vector[bucket] += token.weight * direction;
  }

  return normalizeVector(vector);
}

function shouldUseLocalFallback(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const status =
    "status" in error && typeof error.status === "number" ? error.status : null;
  const causeCode =
    "cause" in error &&
    error.cause &&
    typeof error.cause === "object" &&
    "code" in error.cause &&
    typeof error.cause.code === "string"
      ? error.cause.code.toUpperCase()
      : "";
  const message =
    "error" in error &&
    error.error &&
    typeof error.error === "object" &&
    "message" in error.error &&
    typeof error.error.message === "string"
      ? error.error.message.toLowerCase()
      : error instanceof Error
        ? error.message.toLowerCase()
        : "";

  return (
    status === 403 ||
    status === 404 ||
    (message.includes("model") && message.includes("not exist")) ||
    message.includes("do not have access") ||
    message.includes("connection error") ||
    causeCode === "EACCES" ||
    causeCode === "ECONNREFUSED" ||
    causeCode === "ECONNRESET" ||
    causeCode === "ETIMEDOUT"
  );
}

function shouldEmbedLocally(preferredModel: string) {
  if (preferredModel === LOCAL_EMBEDDING_MODEL) {
    return true;
  }

  if (EMBEDDINGS_PROVIDER === "local") {
    return true;
  }

  if (groqEmbeddingAccess === false) {
    return true;
  }

  if (!process.env.GROQ_API_KEY && EMBEDDINGS_PROVIDER === "auto") {
    return true;
  }

  return false;
}

function logLocalFallback(error?: unknown) {
  if (didLogLocalFallback) {
    return;
  }

  didLogLocalFallback = true;

  const reason =
    error instanceof Error
      ? error.message
      : "Groq embeddings are not available for this account.";

  console.warn(
    `Lexora embeddings fallback: using ${LOCAL_EMBEDDING_MODEL} because ${reason}`,
  );
}

function embedTextsLocally(texts: string[]): EmbedTextsResult {
  return {
    embeddings: texts.map((text) => createLocalEmbedding(text)),
    model: LOCAL_EMBEDDING_MODEL,
  };
}

export function getGroqClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  return groqClient;
}

export async function embedTexts(
  texts: string[],
  preferredModel = GROQ_EMBEDDING_MODEL,
): Promise<EmbedTextsResult> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      model: preferredModel,
    };
  }

  if (shouldEmbedLocally(preferredModel)) {
    return embedTextsLocally(texts);
  }

  const client = getGroqClient();
  const embeddings: number[][] = [];

  try {
    for (let index = 0; index < texts.length; index += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(index, index + EMBEDDING_BATCH_SIZE);
      const response = await client.embeddings.create({
        input: batch,
        model: preferredModel,
        encoding_format: "float",
      });

      const batchEmbeddings = response.data
        .sort((left, right) => left.index - right.index)
        .map((item) => toFloatEmbedding(item.embedding));

      embeddings.push(...batchEmbeddings);
    }
  } catch (error) {
    if (EMBEDDINGS_PROVIDER === "groq" || !shouldUseLocalFallback(error)) {
      throw error;
    }

    groqEmbeddingAccess = false;
    logLocalFallback(error);
    return embedTextsLocally(texts);
  }

  groqEmbeddingAccess = true;

  return {
    embeddings,
    model: preferredModel,
  };
}

export async function embedQuery(text: string, preferredModel?: string) {
  const result = await embedTexts([text], preferredModel);

  return {
    embedding: result.embeddings[0],
    model: result.model,
  };
}
