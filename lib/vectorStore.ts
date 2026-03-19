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
import { parsePdfFile } from "@/lib/pdfParser";
import {
  ensureUserWorkspaceDirectories,
  LEGACY_INDEX_ROOT,
  LEGACY_MANIFEST_PATH,
  PUBLIC_UPLOADS_ROOT,
  resolveUserIndexesRoot,
  resolveUserManifestPath,
  resolveUserUploadUrl,
  resolveUserUploadsRoot,
  LEXORA_ROOT,
} from "@/lib/storage";
import type {
  IndexedDocument,
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

type IndexDocumentInput = {
  userId: string;
  documentId?: string;
  name: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
};

const LEGACY_UPLOADS_ROOT = PUBLIC_UPLOADS_ROOT;

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

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

function resolveIndexFile(userId: string, documentId: string) {
  return path.join(resolveUserIndexesRoot(userId), `${documentId}.json`);
}

function resolveLegacyIndexFile(documentId: string) {
  return path.join(LEGACY_INDEX_ROOT, `${documentId}.json`);
}

function resolvePublicFilePath(fileUrl: string) {
  const relativePath = fileUrl.replace(/^\/+/, "");
  return path.join(process.cwd(), "public", relativePath);
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

async function writeUserManifest(userId: string, documents: IndexedDocument[]) {
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
  return readJsonFile<ManifestFile>(resolveUserManifestPath(userId), {
    documents: [],
    updatedAt: "",
  });
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
    const legacyFilePath = resolvePublicFilePath(legacyDocument.fileUrl);
    const nextFilePath = path.join(resolveUserUploadsRoot(userId), legacyDocument.fileName);

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

    await writeFile(
      resolveIndexFile(userId, nextDocument.id),
      JSON.stringify(nextIndex, null, 2),
      "utf8",
    );
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

  return [...manifest.documents].sort(
    (left, right) =>
      Date.parse(right.indexedAt || "") - Date.parse(left.indexedAt || ""),
  );
}

export async function getDocument(userId: string, documentId: string) {
  const documents = await getDocuments(userId);
  return documents.find((document) => document.id === documentId) ?? null;
}

export async function indexDocument(input: IndexDocumentInput) {
  await ensureUserWorkspaceDirectories(input.userId);

  const documentId = input.documentId ?? randomUUID();
  const filePath = resolvePublicFilePath(input.fileUrl);

  if (!fs.existsSync(filePath)) {
    throw new Error("Uploaded PDF file could not be found for indexing.");
  }

  const parsedPdf = await parsePdfFile(filePath);
  const chunks = chunkText(parsedPdf.pages, {
    chunkSize: DEFAULT_CHUNK_SIZE,
    overlap: DEFAULT_CHUNK_OVERLAP,
  });

  if (chunks.length === 0) {
    throw new Error("The uploaded PDF did not contain readable text.");
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
  };

  const documentIndex: DocumentIndexFile = {
    document,
    chunks: storedChunks,
  };

  await writeFile(
    resolveIndexFile(input.userId, documentId),
    JSON.stringify(documentIndex, null, 2),
    "utf8",
  );

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
): Promise<RetrievedChunk[]> {
  const documentIndex = await readJsonFile<DocumentIndexFile | null>(
    resolveIndexFile(userId, documentId),
    null,
  );

  if (!documentIndex) {
    return [];
  }

  const normalizedQuery = normalizeVector(queryEmbedding);

  return documentIndex.chunks
    .map((chunk) => ({
      ...chunk.metadata,
      text: chunk.text,
      score: dotProduct(chunk.embedding, normalizedQuery),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

export async function searchAcrossIndexedDocuments(
  userId: string,
  queryEmbedding: number[],
  topK = 4,
  documentIds?: string[],
): Promise<RetrievedChunk[]> {
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

export async function reindexDocument(userId: string, documentId: string) {
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
  });
}

export async function deleteDocument(userId: string, documentId: string) {
  const document = await getDocument(userId, documentId);

  if (!document) {
    return null;
  }

  await removeFileIfExists(resolveIndexFile(userId, documentId));
  await removeFileIfExists(resolvePublicFilePath(document.fileUrl));

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
  let entries: Dirent<string>[] = [];
  const uploadsRoot = resolveUserUploadsRoot(userId);

  try {
    entries = await readdir(uploadsRoot, { withFileTypes: true });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }

  const indexedDocuments = await getDocuments(userId);
  const trackedFiles = new Set(indexedDocuments.map((document) => document.fileName));
  const newlyIndexedDocuments: IndexedDocument[] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".pdf")) {
      continue;
    }

    if (trackedFiles.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(uploadsRoot, entry.name);
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
  }

  return newlyIndexedDocuments;
}

export const VECTOR_STORE_ROOT = LEXORA_ROOT;
export const LEGACY_UPLOADS_DIRECTORY = LEGACY_UPLOADS_ROOT;
