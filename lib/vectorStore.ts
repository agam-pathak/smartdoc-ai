import { randomUUID } from "node:crypto";
import fs, { type Dirent } from "node:fs";
import {
  mkdir,
  readdir,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { chunkText } from "@/lib/chunkText";
import { embedTexts } from "@/lib/embeddings";
import { withFileLock } from "@/lib/file-lock";
import {
  getSupabaseAdminClient,
  isSupabaseConfigured,
  SUPABASE_RPC,
  SUPABASE_TABLES,
} from "@/lib/supabase";

import {
  deleteUserUpload,
  ensurePrivateUploadAvailable,
  ensureUserWorkspaceDirectories,
  LEGACY_INDEX_ROOT,
  LEGACY_MANIFEST_PATH,
  LEGACY_PUBLIC_UPLOADS_ROOT,
  resolveLegacyPublicUploadsRoot,
  resolveUserIndexesRoot,
  resolveUserManifestPath,
  resolveUserUploadFilePath,
  resolveUserUploadUrl,
  resolveUserUploadsRoot,
  LEXORA_ROOT,
} from "@/lib/storage";
import type {
  IndexedDocument,
  ParsedPdfDocument,
  RetrievedChunk,
  StoredChunkRecord,
} from "@/lib/types";

type DocumentIndexFile = {
  document: IndexedDocument;
  chunks: StoredChunkRecord[];
};

type ManifestFile = {
  documents: IndexedDocument[];
  updatedAt: string;
};

type DocumentRow = {
  id: string;
  user_id: string;
  name: string;
  file_name: string;
  file_url: string;
  size_bytes: number;
  page_count: number;
  chunk_count: number;
  indexed_at: string;
  embedding_model: string;
  extraction_mode: string | null;
  notes: string | null;
  bookmarked_pages: number[] | null;
  last_opened_at: string | null;
};

type ChunkRow = {
  id: string;
  user_id: string;
  document_id: string;
  embedding_model: string;
  chunk_index: number;
  content: string;
  embedding: string;
  start_offset: number;
  end_offset: number;
  page_start: number;
  page_end: number;
  source: string;
  file_url: string;
  created_at?: string;
};

type MatchedChunkRow = {
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

type IndexDocumentInput = {
  userId: string;
  documentId?: string;
  name: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
  parsedPdf?: ParsedPdfDocument | null;
};

const LEGACY_UPLOADS_ROOT = LEGACY_PUBLIC_UPLOADS_ROOT;

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;
const PLACEHOLDER_CHUNK_SNIPPETS = [
  "wait for system maintenance to restore deep indexing for this document type",
  "this pdf appears to contain image based or scanned pages ocr is recommended before grounded answers can extract detailed content",
  "the system could not extract text from this pdf because the parser worker encountered an environment limitation",
];

function normalizeVector(values: number[]) {
  const magnitude = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    return values.map(() => 0);
  }

  return values.map((value) => value / magnitude);
}

function dotProduct(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let sum = 0;

  for (let index = 0; index < length; index += 1) {
    sum += left[index] * right[index];
  }

  return sum;
}

function normalizeChunkText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPlaceholderChunkText(text: string) {
  const normalizedText = normalizeChunkText(text);

  if (!normalizedText) {
    return true;
  }

  return PLACEHOLDER_CHUNK_SNIPPETS.some((snippet) =>
    normalizedText.includes(snippet),
  );
}

function filterPlaceholderSearchResults(chunks: RetrievedChunk[]) {
  return chunks.filter((chunk) => !isPlaceholderChunkText(chunk.text));
}

function toSupabaseVectorLiteral(embedding: number[]) {
  return `[${embedding.join(",")}]`;
}

function toChunkRow(
  userId: string,
  embeddingModel: string,
  chunk: StoredChunkRecord,
): ChunkRow {
  return {
    id: chunk.id,
    user_id: userId,
    document_id: chunk.metadata.documentId,
    embedding_model: embeddingModel,
    chunk_index: chunk.metadata.chunkIndex,
    content: chunk.text,
    embedding: toSupabaseVectorLiteral(chunk.embedding),
    start_offset: chunk.metadata.start,
    end_offset: chunk.metadata.end,
    page_start: chunk.metadata.pageStart,
    page_end: chunk.metadata.pageEnd,
    source: chunk.metadata.source,
    file_url: chunk.metadata.fileUrl,
  };
}

function fromMatchedChunkRow(row: MatchedChunkRow): RetrievedChunk {
  return {
    documentId: row.document_id,
    source: row.source,
    chunkIndex: row.chunk_index,
    start: row.start_offset,
    end: row.end_offset,
    pageStart: row.page_start,
    pageEnd: row.page_end,
    fileUrl: row.file_url,
    text: row.content,
    score: row.score,
  };
}

function resolveIndexFile(userId: string, documentId: string) {
  return path.join(resolveUserIndexesRoot(userId), `${documentId}.json`);
}

function resolveLegacyIndexFile(documentId: string) {
  return path.join(LEGACY_INDEX_ROOT, `${documentId}.json`);
}

function resolveLegacyPublicFilePath(fileUrl: string) {
  const relativePath = fileUrl.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", relativePath);
}

async function resolveIndexedUploadFilePath(
  userId: string,
  fileName: string,
  fileUrl: string,
) {
  const privatePath = resolveUserUploadFilePath(userId, fileName);

  if (fs.existsSync(privatePath)) {
    return privatePath;
  }

  await ensurePrivateUploadAvailable(userId, fileName);

  if (fs.existsSync(privatePath)) {
    return privatePath;
  }

  const legacyPath = resolveLegacyPublicFilePath(fileUrl);
  return fs.existsSync(legacyPath) ? legacyPath : privatePath;
}

function deriveDisplayName(fileName: string) {
  return path
    .parse(fileName)
    .name.replace(/-\d+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

async function readJsonFile<T>(filePath: string, fallback: T) {
  try {
    const contents = await readFile(filePath, "utf8");
    return JSON.parse(contents) as T;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return fallback;
    }

    throw error;
  }
}

async function readDocumentIndexFromFile(userId: string, documentId: string) {
  return readJsonFile<DocumentIndexFile | null>(
    resolveIndexFile(userId, documentId),
    null,
  );
}

async function writeDocumentIndexToFile(
  userId: string,
  documentId: string,
  documentIndex: DocumentIndexFile,
) {
  await writeFile(
    resolveIndexFile(userId, documentId),
    JSON.stringify(documentIndex, null, 2),
    "utf8",
  );
}

async function deleteDocumentIndexFromFile(userId: string, documentId: string) {
  await removeFileIfExists(resolveIndexFile(userId, documentId));
}

async function writeUserManifest(userId: string, documents: IndexedDocument[]) {
  if (isSupabaseConfigured()) {
    await writeUserManifestToSupabase(userId, documents);
    return;
  }

  await writeUserManifestToFile(userId, documents);
}

function fromDocumentRow(row: DocumentRow): IndexedDocument {
  return {
    id: row.id,
    name: row.name,
    fileName: row.file_name,
    fileUrl: row.file_url,
    sizeBytes: row.size_bytes,
    pageCount: row.page_count,
    chunkCount: row.chunk_count,
    indexedAt: row.indexed_at,
    embeddingModel: row.embedding_model,
    extractionMode: (row.extraction_mode as IndexedDocument["extractionMode"]) ?? "text",
    notes: row.notes ?? "",
    bookmarkedPages: Array.isArray(row.bookmarked_pages) ? row.bookmarked_pages : [],
    lastOpenedAt: row.last_opened_at ?? undefined,
  };
}

function toDocumentRow(userId: string, document: IndexedDocument): DocumentRow {
  return {
    id: document.id,
    user_id: userId,
    name: document.name,
    file_name: document.fileName,
    file_url: document.fileUrl,
    size_bytes: document.sizeBytes,
    page_count: document.pageCount,
    chunk_count: document.chunkCount,
    indexed_at: document.indexedAt,
    embedding_model: document.embeddingModel,
    extraction_mode: document.extractionMode ?? "text",
    notes: document.notes ?? "",
    bookmarked_pages: document.bookmarkedPages ?? [],
    last_opened_at: document.lastOpenedAt ?? null,
  };
}

async function deleteSupabaseChunksForDocument(documentId: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const { error } = await supabase
    .from(SUPABASE_TABLES.chunks)
    .delete()
    .eq("document_id", documentId);

  if (error) {
    throw error;
  }
}

async function writeChunksToSupabase(
  userId: string,
  documentId: string,
  embeddingModel: string,
  chunks: StoredChunkRecord[],
) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  await deleteSupabaseChunksForDocument(documentId);

  for (let index = 0; index < chunks.length; index += 100) {
    const batch = chunks.slice(index, index + 100);
    const { error } = await supabase
      .from(SUPABASE_TABLES.chunks)
      .insert(batch.map((chunk) => toChunkRow(userId, embeddingModel, chunk)));

    if (error) {
      throw error;
    }
  }
}

async function syncLocalIndexToSupabase(userId: string, documentId: string) {
  const documentIndex = await readDocumentIndexFromFile(userId, documentId);

  if (!documentIndex) {
    return false;
  }

  await writeChunksToSupabase(
    userId,
    documentId,
    documentIndex.document.embeddingModel,
    documentIndex.chunks,
  );

  return true;
}

async function searchSupabaseChunks(
  userId: string,
  queryEmbedding: number[],
  topK: number,
  options: {
    documentId?: string;
    documentIds?: string[];
    embeddingModel?: string;
  } = {},
): Promise<RetrievedChunk[]> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.rpc(SUPABASE_RPC.matchChunks, {
    query_embedding: toSupabaseVectorLiteral(normalizeVector(queryEmbedding)),
    filter_user_id: userId,
    match_count: topK,
    filter_document_id: options.documentId ?? null,
    filter_document_ids: options.documentIds?.length ? options.documentIds : null,
    filter_embedding_model: options.embeddingModel ?? null,
  });

  if (error) {
    throw error;
  }

  return ((data as MatchedChunkRow[] | null) ?? []).map((row) =>
    fromMatchedChunkRow(row),
  );
}

async function readUserManifestFromFile(userId: string) {
  return readJsonFile<ManifestFile>(resolveUserManifestPath(userId), {
    documents: [],
    updatedAt: "",
  });
}

async function loadSupabaseDocumentRows(userId: string) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from(SUPABASE_TABLES.documents)
    .select("*")
    .eq("user_id", userId)
    .order("indexed_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data as DocumentRow[] | null) ?? [];
}

async function readUserManifestFromSupabase(userId: string) {
  let rows = await loadSupabaseDocumentRows(userId);

  if (rows.length === 0) {
    const fileManifest = await readUserManifestFromFile(userId);

    if (fileManifest.documents.length > 0) {
      await writeUserManifestToSupabase(userId, fileManifest.documents);
      rows = await loadSupabaseDocumentRows(userId);
    }
  }

  return {
    documents: rows.map((row) => fromDocumentRow(row)),
    updatedAt: rows[0]?.indexed_at ?? "",
  };
}

async function writeUserManifestToSupabase(userId: string, documents: IndexedDocument[]) {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return;
  }

  const normalizedDocuments = [...documents].sort(
    (left, right) =>
      Date.parse(right.indexedAt || "") - Date.parse(left.indexedAt || ""),
  );
  const documentIds = normalizedDocuments.map((document) => document.id);

  if (documentIds.length === 0) {
    const { error: deleteAllError } = await supabase
      .from(SUPABASE_TABLES.documents)
      .delete()
      .eq("user_id", userId);

    if (deleteAllError) {
      throw deleteAllError;
    }

    return;
  }

  const existingRows = await loadSupabaseDocumentRows(userId);
  const idsToDelete = existingRows
    .map((document) => document.id)
    .filter((documentId) => !documentIds.includes(documentId));

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from(SUPABASE_TABLES.documents)
      .delete()
      .in("id", idsToDelete);

    if (deleteError) {
      throw deleteError;
    }
  }

  const { error: upsertError } = await supabase
    .from(SUPABASE_TABLES.documents)
    .upsert(
      normalizedDocuments.map((document) => toDocumentRow(userId, document)),
      { onConflict: "id" },
    );

  if (upsertError) {
    throw upsertError;
  }
}

async function writeUserManifestToFile(userId: string, documents: IndexedDocument[]) {
  const manifestPath = resolveUserManifestPath(userId);

  await withFileLock(manifestPath, async () => {
    await ensureUserWorkspaceDirectories(userId);

    const sortedDocuments = [...documents].sort(
      (left, right) =>
        Date.parse(right.indexedAt || "") - Date.parse(left.indexedAt || ""),
    );

    const manifest: ManifestFile = {
      documents: sortedDocuments,
      updatedAt: new Date().toISOString(),
    };

    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  });
}

async function readUserManifest(userId: string) {
  if (isSupabaseConfigured()) {
    return readUserManifestFromSupabase(userId);
  }

  return readUserManifestFromFile(userId);
}

async function readLegacyManifest() {
  return readJsonFile<ManifestFile>(LEGACY_MANIFEST_PATH, {
    documents: [],
    updatedAt: "",
  });
}

async function writeLegacyManifest(documents: IndexedDocument[]) {
  await withFileLock(LEGACY_MANIFEST_PATH, async () => {
    const manifest: ManifestFile = {
      documents,
      updatedAt: new Date().toISOString(),
    };

    await mkdir(path.dirname(LEGACY_MANIFEST_PATH), { recursive: true });
    await writeFile(LEGACY_MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  });
}

async function removeFileIfExists(filePath: string) {
  try {
    await unlink(filePath);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return;
    }

    throw error;
  }
}

async function copyFileToPath(sourcePath: string, targetPath: string) {
  const contents = await readFile(sourcePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, contents);
}

export async function migrateLegacyDocumentsToUser(userId: string) {
  const userManifest = await readUserManifest(userId);

  if (userManifest.documents.length > 0) {
    return [];
  }

  const legacyManifest = await readLegacyManifest();

  if (legacyManifest.documents.length === 0) {
    return [];
  }

  await ensureUserWorkspaceDirectories(userId);
  const migratedDocuments: IndexedDocument[] = [];

  for (const legacyDocument of legacyManifest.documents) {
    const legacyIndex = await readJsonFile<DocumentIndexFile | null>(
      resolveLegacyIndexFile(legacyDocument.id),
      null,
    );

    if (!legacyIndex) {
      continue;
    }

    const nextFileUrl = resolveUserUploadUrl(userId, legacyDocument.fileName);
    const legacyFilePath = resolveLegacyPublicFilePath(legacyDocument.fileUrl);
    const nextFilePath = resolveUserUploadFilePath(
      userId,
      legacyDocument.fileName,
    );

    if (fs.existsSync(legacyFilePath) && legacyFilePath !== nextFilePath) {
      await copyFileToPath(legacyFilePath, nextFilePath);
      await removeFileIfExists(legacyFilePath);
    }

    const nextDocument: IndexedDocument = {
      ...legacyDocument,
      fileUrl: nextFileUrl,
    };

    const nextIndex: DocumentIndexFile = {
      document: nextDocument,
      chunks: legacyIndex.chunks.map((chunk) => ({
        ...chunk,
        metadata: {
          ...chunk.metadata,
          fileUrl: nextFileUrl,
        },
      })),
    };

    await writeDocumentIndexToFile(userId, nextDocument.id, nextIndex);

    if (isSupabaseConfigured()) {
      await writeChunksToSupabase(
        userId,
        nextDocument.id,
        nextDocument.embeddingModel,
        nextIndex.chunks,
      );
    }

    await removeFileIfExists(resolveLegacyIndexFile(nextDocument.id));
    migratedDocuments.push(nextDocument);
  }

  if (migratedDocuments.length > 0) {
    await writeUserManifest(userId, migratedDocuments);
    await writeLegacyManifest(
      legacyManifest.documents.filter(
        (document) =>
          !migratedDocuments.some(
            (migratedDocument) => migratedDocument.id === document.id,
          ),
      ),
    );
  }

  return migratedDocuments;
}

export async function getDocuments(userId: string) {
  const manifest = await readUserManifest(userId);

  const documents: IndexedDocument[] = [...manifest.documents]
    .map((document) => ({
      ...document,
      extractionMode: document.extractionMode ?? "text",
      notes: document.notes ?? "",
      bookmarkedPages: document.bookmarkedPages ?? [],
    }))
    .sort(
      (left, right) =>
        Date.parse(right.indexedAt || "") - Date.parse(left.indexedAt || ""),
    );

  await Promise.all(
    documents.map((document) =>
      ensurePrivateUploadAvailable(userId, document.fileName),
    ),
  );

  return documents;
}

export async function getDocument(userId: string, documentId: string) {
  const documents = await getDocuments(userId);
  return documents.find((document) => document.id === documentId) ?? null;
}

type UpdateDocumentMetadataInput = {
  notes?: string;
  bookmarkedPages?: number[];
  lastOpenedAt?: string;
};

export async function updateDocumentMetadata(
  userId: string,
  documentId: string,
  updates: UpdateDocumentMetadataInput,
) {
  const documents = await getDocuments(userId);
  const documentIndex = documents.findIndex((document) => document.id === documentId);

  if (documentIndex < 0) {
    return null;
  }

  const existingDocument = documents[documentIndex];
  const nextDocument: IndexedDocument = {
    ...existingDocument,
    extractionMode: existingDocument.extractionMode ?? "text",
    notes:
      typeof updates.notes === "string"
        ? updates.notes.trim().slice(0, 5000)
        : existingDocument.notes,
    bookmarkedPages: Array.isArray(updates.bookmarkedPages)
      ? [...new Set(
          updates.bookmarkedPages
            .map((page) => Math.max(1, Math.floor(page)))
            .filter(Boolean),
        )].sort((left, right) => left - right)
      : existingDocument.bookmarkedPages,
    lastOpenedAt:
      typeof updates.lastOpenedAt === "string"
        ? updates.lastOpenedAt
        : existingDocument.lastOpenedAt,
  };

  const nextDocuments = [...documents];
  nextDocuments[documentIndex] = nextDocument;
  await writeUserManifest(userId, nextDocuments);

  return nextDocument;
}

export async function indexDocument(input: IndexDocumentInput) {
  await ensureUserWorkspaceDirectories(input.userId);

  const documentId = input.documentId ?? randomUUID();
  const filePath = await resolveIndexedUploadFilePath(
    input.userId,
    input.fileName,
    input.fileUrl,
  );

  if (!fs.existsSync(filePath)) {
    throw new Error("Uploaded PDF file could not be found for indexing.");
  }

  let parsedPdf = input.parsedPdf ?? null;

  if (!parsedPdf) {
    try {
      const { parsePdfFile } = await import("@/lib/pdfParser");
      parsedPdf = await parsePdfFile(filePath);
    } catch (error) {
      console.error("PDF Parsing Failure:", error);
      parsedPdf = {
        text: "",
        pageCount: 1,
        pages: [],
        extractionMode: "ocr-recommended",
      };
    }
  }

  const chunks = chunkText(parsedPdf.pages, {
    chunkSize: DEFAULT_CHUNK_SIZE,
    overlap: DEFAULT_CHUNK_OVERLAP,
  }).filter((chunk) => !isPlaceholderChunkText(chunk.text));

  if (chunks.length === 0) {
    console.warn(
      `No searchable text was extracted for document ${documentId}.`,
    );
  }

  const embeddingResult = await embedTexts(chunks.map((chunk) => chunk.text));

  const storedChunks: StoredChunkRecord[] = chunks.map((chunk, index) => ({
    id: `${documentId}:${chunk.chunkIndex}`,
    text: chunk.text,
    embedding: normalizeVector(embeddingResult.embeddings[index]),
    metadata: {
      documentId,
      source: input.name,
      chunkIndex: chunk.chunkIndex,
      start: chunk.start,
      end: chunk.end,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      fileUrl: input.fileUrl,
    },
  }));

  const document: IndexedDocument = {
    id: documentId,
    name: input.name,
    fileName: input.fileName,
    fileUrl: input.fileUrl,
    sizeBytes: input.sizeBytes,
    pageCount: parsedPdf.pageCount,
    chunkCount: storedChunks.length,
    indexedAt: new Date().toISOString(),
    embeddingModel: embeddingResult.model,
    extractionMode: parsedPdf.extractionMode,
    notes: "",
    bookmarkedPages: [],
  };

  const documentIndex: DocumentIndexFile = {
    document,
    chunks: storedChunks,
  };

  if (isSupabaseConfigured()) {
    await writeChunksToSupabase(
      input.userId,
      documentId,
      document.embeddingModel,
      storedChunks,
    );
    await deleteDocumentIndexFromFile(input.userId, documentId);
  } else {
    await writeDocumentIndexToFile(input.userId, documentId, documentIndex);
  }

  const documents = await getDocuments(input.userId);
  const nextDocuments = [
    document,
    ...documents.filter((existingDocument) => existingDocument.id !== documentId),
  ];

  await writeUserManifest(input.userId, nextDocuments);

  return document;
}

export async function searchIndexedDocument(
  userId: string,
  documentId: string,
  queryEmbedding: number[],
  topK = 4,
  allowRepair = true,
): Promise<RetrievedChunk[]> {
  if (isSupabaseConfigured()) {
    const searchWindow = Math.max(topK * 3, 8);
    let supabaseResults = await searchSupabaseChunks(
      userId,
      queryEmbedding,
      searchWindow,
      { documentId },
    );

    if (supabaseResults.length === 0) {
      const synced = await syncLocalIndexToSupabase(userId, documentId);

      if (synced) {
        supabaseResults = await searchSupabaseChunks(
          userId,
          queryEmbedding,
          searchWindow,
          { documentId },
        );
      }
    }

    const filteredResults = filterPlaceholderSearchResults(supabaseResults).slice(0, topK);

    if (
      filteredResults.length === 0 &&
      supabaseResults.length > 0 &&
      allowRepair
    ) {
      try {
        await reindexDocument(userId, documentId);
        return searchIndexedDocument(userId, documentId, queryEmbedding, topK, false);
      } catch (error) {
        console.warn("Document auto-reindex failed after placeholder retrieval.", error);
      }
    }

    return filteredResults;
  }

  const documentIndex = await readDocumentIndexFromFile(userId, documentId);

  if (!documentIndex) {
    return [];
  }

  const normalizedQuery = normalizeVector(queryEmbedding);

  const localResults = documentIndex.chunks
    .map((chunk) => ({
      ...chunk.metadata,
      text: chunk.text,
      score: dotProduct(chunk.embedding, normalizedQuery),
    }))
    .sort((left, right) => right.score - left.score);

  const filteredResults = filterPlaceholderSearchResults(localResults).slice(0, topK);

  if (
    filteredResults.length === 0 &&
    localResults.length > 0 &&
    allowRepair
  ) {
    try {
      await reindexDocument(userId, documentId);
      return searchIndexedDocument(userId, documentId, queryEmbedding, topK, false);
    } catch (error) {
      console.warn("Document auto-reindex failed after placeholder retrieval.", error);
    }
  }

  return filteredResults;
}

export async function searchAcrossIndexedDocuments(
  userId: string,
  queryEmbedding: number[],
  topK = 4,
  documentIds?: string[],
): Promise<RetrievedChunk[]> {
  if (isSupabaseConfigured()) {
    const searchWindow = Math.max(topK * 3, 8);
    let supabaseResults = await searchSupabaseChunks(
      userId,
      queryEmbedding,
      searchWindow,
      { documentIds },
    );

    if (supabaseResults.length === 0 && documentIds?.length) {
      let didSyncAny = false;

      for (const documentId of documentIds) {
        didSyncAny =
          (await syncLocalIndexToSupabase(userId, documentId)) || didSyncAny;
      }

      if (didSyncAny) {
        supabaseResults = await searchSupabaseChunks(
          userId,
          queryEmbedding,
          searchWindow,
          { documentIds },
        );
      }
    }

    return filterPlaceholderSearchResults(supabaseResults).slice(0, topK);
  }

  const documents = documentIds?.length
    ? (
        await Promise.all(
          documentIds.map((documentId) => getDocument(userId, documentId)),
        )
      ).filter((document): document is IndexedDocument => document !== null)
    : await getDocuments(userId);

  const results = await Promise.all(
    documents.map((document) =>
      searchIndexedDocument(userId, document.id, queryEmbedding, topK),
    ),
  );

  return results
    .flat()
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export async function reindexDocument(
  userId: string,
  documentId: string,
  parsedPdf?: ParsedPdfDocument | null,
) {
  const document = await getDocument(userId, documentId);

  if (!document) {
    throw new Error("Document not found.");
  }

  return indexDocument({
    userId,
    documentId: document.id,
    name: document.name,
    fileName: document.fileName,
    fileUrl: document.fileUrl,
    sizeBytes: document.sizeBytes,
    parsedPdf,
  });
}

export async function deleteDocument(userId: string, documentId: string) {
  const document = await getDocument(userId, documentId);

  if (!document) {
    return null;
  }

  if (isSupabaseConfigured()) {
    await deleteSupabaseChunksForDocument(documentId);
  }

  await deleteDocumentIndexFromFile(userId, documentId);
  await deleteUserUpload(userId, document.fileName);
  await removeFileIfExists(resolveLegacyPublicFilePath(document.fileUrl));

  const documents = await getDocuments(userId);
  await writeUserManifest(
    userId,
    documents.filter((existingDocument) => existingDocument.id !== documentId),
  );

  return document;
}

export async function reindexAllDocuments(userId: string) {
  const documents = await getDocuments(userId);
  const reindexedDocuments: IndexedDocument[] = [];

  for (const document of documents) {
    reindexedDocuments.push(await reindexDocument(userId, document.id));
  }

  return reindexedDocuments;
}

export async function indexUntrackedUploads(userId: string) {
  const indexedDocuments = await getDocuments(userId);
  const trackedFiles = new Set(indexedDocuments.map((document) => document.fileName));
  const newlyIndexedDocuments: IndexedDocument[] = [];
  const seenFileNames = new Set<string>();
  const uploadRoots = [
    resolveUserUploadsRoot(userId),
    resolveLegacyPublicUploadsRoot(userId),
  ];

  for (const uploadRoot of uploadRoots) {
    let entries: Dirent<string>[] = [];

    try {
      entries = await readdir(uploadRoot, { withFileTypes: true });
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }

      throw error;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) {
        continue;
      }

      if (trackedFiles.has(entry.name) || seenFileNames.has(entry.name)) {
        continue;
      }

      if (uploadRoot !== resolveUserUploadsRoot(userId)) {
        await ensurePrivateUploadAvailable(userId, entry.name);
      }

      const fullPath = resolveUserUploadFilePath(userId, entry.name);
      const fileStats = await stat(fullPath);

      newlyIndexedDocuments.push(
        await indexDocument({
          userId,
          name: deriveDisplayName(entry.name) || "Uploaded document",
          fileName: entry.name,
          fileUrl: resolveUserUploadUrl(userId, entry.name),
          sizeBytes: fileStats.size,
        }),
      );
      seenFileNames.add(entry.name);
    }
  }

  return newlyIndexedDocuments;
}

export const VECTOR_STORE_ROOT = LEXORA_ROOT;
export const LEGACY_UPLOADS_DIRECTORY = LEGACY_UPLOADS_ROOT;
