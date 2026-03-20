import type { ChatSource, RetrievedChunk } from "@/lib/types";
import { embedQuery } from "@/lib/embeddings";
import {
  getDocuments,
  searchAcrossIndexedDocuments,
  searchIndexedDocument,
} from "@/lib/vectorStore";

type RetrieveChunksOptions = {
  userId: string;
  documentId?: string;
  question: string;
  embeddingModel?: string;
  topK?: number;
  searchMode?: "document" | "all";
};

type RerankedChunk = RetrievedChunk & {
  documentRank?: number;
  documentHitCount?: number;
};

function formatPageRange(pageStart: number, pageEnd: number) {
  return pageStart === pageEnd
    ? `page ${pageStart}`
    : `pages ${pageStart}-${pageEnd}`;
}

export async function retrieveRelevantChunks({
  userId,
  documentId,
  question,
  embeddingModel,
  topK = 4,
  searchMode = "document",
}: RetrieveChunksOptions) {
  if (searchMode === "all" || !documentId) {
    const documents = await getDocuments(userId);

    if (documents.length === 0) {
      return [];
    }

    const documentIdsByModel = new Map<string, string[]>();

    for (const document of documents) {
      const documentIds = documentIdsByModel.get(document.embeddingModel) ?? [];
      documentIds.push(document.id);
      documentIdsByModel.set(document.embeddingModel, documentIds);
    }

    const results: RetrievedChunk[] = [];

    for (const [model, documentIds] of documentIdsByModel.entries()) {
      const query = await embedQuery(question, model);
      const chunks = await searchAcrossIndexedDocuments(
        userId,
        query.embedding,
        Math.max(topK * 3, 8),
        documentIds,
      );
      results.push(...chunks);
    }

    return rerankLibraryChunks(results, topK);
  }

  const query = await embedQuery(question, embeddingModel);
  return searchIndexedDocument(userId, documentId, query.embedding, topK);
}

function rerankLibraryChunks(chunks: RetrievedChunk[], topK: number) {
  const documentStats = new Map<
    string,
    {
      count: number;
      bestScore: number;
      averageScore: number;
    }
  >();

  for (const chunk of chunks) {
    const entry = documentStats.get(chunk.documentId) ?? {
      count: 0,
      bestScore: Number.NEGATIVE_INFINITY,
      averageScore: 0,
    };

    entry.count += 1;
    entry.bestScore = Math.max(entry.bestScore, chunk.score);
    entry.averageScore =
      (entry.averageScore * (entry.count - 1) + chunk.score) / entry.count;
    documentStats.set(chunk.documentId, entry);
  }

  const sortedDocumentIds = [...documentStats.entries()]
    .sort(
      (left, right) =>
        right[1].bestScore - left[1].bestScore ||
        right[1].count - left[1].count,
    )
    .map(([documentId]) => documentId);
  const documentRankMap = new Map(
    sortedDocumentIds.map((documentId, index) => [documentId, index + 1]),
  );

  const rerankedChunks: RerankedChunk[] = chunks
    .map((chunk) => {
      const stats = documentStats.get(chunk.documentId)!;
      const documentBoost = Math.min(stats.count, 3) * 0.025;
      const rankBoost = Math.max(0, 4 - (documentRankMap.get(chunk.documentId) ?? 4)) * 0.01;

      return {
        ...chunk,
        score: chunk.score + documentBoost + rankBoost,
        documentRank: documentRankMap.get(chunk.documentId),
        documentHitCount: stats.count,
      };
    })
    .sort((left, right) => right.score - left.score);

  const selectedChunks: RerankedChunk[] = [];
  const perDocumentCounts = new Map<string, number>();

  for (const chunk of rerankedChunks) {
    const currentCount = perDocumentCounts.get(chunk.documentId) ?? 0;

    if (selectedChunks.length >= topK) {
      break;
    }

    if (currentCount >= 2 && perDocumentCounts.size < topK) {
      continue;
    }

    selectedChunks.push(chunk);
    perDocumentCounts.set(chunk.documentId, currentCount + 1);
  }

  return selectedChunks;
}

export function buildContext(chunks: RetrievedChunk[]) {
  return chunks
    .map(
      (chunk, index) =>
        `Context ${index + 1} (${formatPageRange(
          chunk.pageStart,
          chunk.pageEnd,
        )}, chunk ${chunk.chunkIndex}):\n${chunk.text}`,
    )
    .join("\n\n");
}

export function toChatSources(chunks: RetrievedChunk[]): ChatSource[] {
  return chunks.map((chunk) => {
    const rankedChunk = chunk as RerankedChunk;

    return {
    documentId: chunk.documentId,
    chunkIndex: chunk.chunkIndex,
    fileUrl: chunk.fileUrl,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    source: chunk.source,
    score: Number(chunk.score.toFixed(4)),
    excerpt: chunk.text.slice(0, 240).trim(),
    documentRank: rankedChunk.documentRank,
    documentHitCount: rankedChunk.documentHitCount,
  };
  });
}
