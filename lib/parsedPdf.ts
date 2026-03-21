import type {
  DocumentExtractionMode,
  ParsedPdfDocument,
  ParsedPdfPage,
} from "@/lib/types";

const VALID_EXTRACTION_MODES = new Set<DocumentExtractionMode>([
  "text",
  "ocr",
  "ocr-recommended",
]);
const MIN_AVERAGE_DOCUMENT_CHARACTERS = 80;

export function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeParsedPdfPages(value: unknown): ParsedPdfPage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((page) => {
      if (!page || typeof page !== "object") {
        return null;
      }

      const pageNumber =
        "pageNumber" in page && typeof page.pageNumber === "number"
          ? Math.max(1, Math.trunc(page.pageNumber))
          : 0;
      const text =
        "text" in page && typeof page.text === "string"
          ? normalizeExtractedText(page.text)
          : "";

      if (!pageNumber) {
        return null;
      }

      return {
        pageNumber,
        text,
      };
    })
    .filter((page): page is ParsedPdfPage => page !== null);
}

export function buildParsedPdfDocument(
  pages: ParsedPdfPage[],
  pageCount: number,
  extractionMode?: DocumentExtractionMode,
): ParsedPdfDocument {
  const normalizedPages = normalizeParsedPdfPages(pages);
  const normalizedPageCount = Math.max(
    0,
    Math.trunc(pageCount) || 0,
    ...normalizedPages.map((page) => page.pageNumber),
  );
  const text = normalizeExtractedText(
    normalizedPages.map((page) => page.text).join("\n\n"),
  );
  const averageCharactersPerPage =
    normalizedPageCount > 0 ? text.length / normalizedPageCount : text.length;
  const resolvedExtractionMode: DocumentExtractionMode =
    extractionMode && VALID_EXTRACTION_MODES.has(extractionMode)
      ? extractionMode
      : text.length === 0 ||
          averageCharactersPerPage < MIN_AVERAGE_DOCUMENT_CHARACTERS
        ? "ocr-recommended"
        : "text";

  return {
    text,
    pageCount: normalizedPageCount,
    pages: normalizedPages,
    extractionMode: resolvedExtractionMode,
  };
}

export function coerceParsedPdfDocument(value: unknown) {
  let parsedValue = value;

  if (typeof parsedValue === "string") {
    try {
      parsedValue = JSON.parse(parsedValue) as unknown;
    } catch {
      return null;
    }
  }

  if (!parsedValue || typeof parsedValue !== "object") {
    return null;
  }

  const pageCount =
    "pageCount" in parsedValue && typeof parsedValue.pageCount === "number"
      ? parsedValue.pageCount
      : 0;
  const pages =
    "pages" in parsedValue
      ? normalizeParsedPdfPages(parsedValue.pages)
      : [];
  const extractionMode =
    "extractionMode" in parsedValue &&
    typeof parsedValue.extractionMode === "string" &&
    VALID_EXTRACTION_MODES.has(parsedValue.extractionMode as DocumentExtractionMode)
      ? (parsedValue.extractionMode as DocumentExtractionMode)
      : undefined;

  return buildParsedPdfDocument(pages, pageCount, extractionMode);
}
