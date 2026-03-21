export type DocumentExtractionMode = "text" | "ocr" | "ocr-recommended";

export type IndexedDocument = {
  id: string;
  name: string;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  indexedAt: string;
  embeddingModel: string;
  extractionMode?: DocumentExtractionMode;
  notes?: string;
  bookmarkedPages?: number[];
  lastOpenedAt?: string;
};

export type ParsedPdfPage = {
  pageNumber: number;
  text: string;
};

export type ParsedPdfDocument = {
  text: string;
  pageCount: number;
  pages: ParsedPdfPage[];
  extractionMode: DocumentExtractionMode;
};

export type ChunkRecord = {
  chunkIndex: number;
  text: string;
  start: number;
  end: number;
  pageStart: number;
  pageEnd: number;
};

export type ChunkMetadata = {
  documentId: string;
  source: string;
  chunkIndex: number;
  start: number;
  end: number;
  pageStart: number;
  pageEnd: number;
  fileUrl: string;
};

export type StoredChunkRecord = {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
};

export type RetrievedChunk = ChunkMetadata & {
  text: string;
  score: number;
};

export type ChatSource = {
  documentId: string;
  chunkIndex: number;
  fileUrl: string;
  pageStart: number;
  pageEnd: number;
  source: string;
  score: number;
  excerpt: string;
  documentRank?: number;
  documentHitCount?: number;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
  sources?: ChatSource[];
};

export type ConversationRecord = {
  id: string;
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  messages: ConversationMessage[];
};

export type ConversationSummary = {
  id: string;
  documentId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessagePreview: string;
  pinned: boolean;
};

export type AuthSession = {
  userId: string;
  name: string;
  email: string;
  issuedAt: string;
  expiresAt: string;
};
