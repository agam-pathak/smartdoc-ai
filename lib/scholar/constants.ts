export const SCHOLAR_NAMESPACE_ID =
  process.env.LEXORA_SCHOLAR_NAMESPACE_ID?.trim() || "global_exam_kb";

export const SCHOLAR_MATCH_RPC =
  process.env.LEXORA_SCHOLAR_MATCH_RPC?.trim() || "match_lexora_document_chunks";

export const SCHOLAR_EMBEDDING_MODEL =
  process.env.GROQ_SCHOLAR_EMBEDDING_MODEL?.trim() ||
  process.env.GROQ_EMBEDDING_MODEL?.trim() ||
  "nomic-embed-text-v1_5";

export const SCHOLAR_PRIMARY_CHAT_MODEL =
  process.env.GROQ_SCHOLAR_MODEL?.trim() || "llama-3.3-70b-versatile";

export const SCHOLAR_FALLBACK_CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL?.trim() || "llama-3.1-8b-instant";

export const SCHOLAR_CHAT_MODELS = [
  SCHOLAR_PRIMARY_CHAT_MODEL,
  SCHOLAR_FALLBACK_CHAT_MODEL,
].filter((value, index, values) => Boolean(value) && values.indexOf(value) === index);

export const SCHOLAR_TOP_K = 8;
export const LOCAL_EMBEDDING_MODEL = "local-hash-v1";
