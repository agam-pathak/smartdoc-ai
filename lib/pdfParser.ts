if (
  typeof global !== "undefined" &&
  typeof (global as { DOMMatrix?: unknown }).DOMMatrix === "undefined"
) {
  (global as { DOMMatrix?: new (...args: unknown[]) => unknown }).DOMMatrix =
    class DOMMatrixStub {};
}

import { PDFParse } from "pdf-parse";
import { createRequire } from "node:module";

import { extractPdfPagesWithOcr } from "@/lib/ocr";
import {
  buildParsedPdfDocument,
  normalizeExtractedText,
} from "@/lib/parsedPdf";
import type {
  ParsedPdfDocument,
  ParsedPdfPage,
} from "@/lib/types";

// Polyfill PDF.js DOM globals for Node runtimes.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type NativePdfExtraction = {
  text: string;
  pageCount: number;
  pages: ParsedPdfPage[];
};

const MIN_PAGE_CHARACTERS_FOR_NATIVE_TEXT = 70;

let didConfigurePdfWorker = false;
let didConfigureOcrDomPolyfills = false;
const require = createRequire(import.meta.url);
const CANVAS_MODULE_NAME = ["@napi-rs", "canvas"].join("/");

type CanvasPolyfillModule = {
  DOMMatrix: new (...args: unknown[]) => unknown;
  ImageData: new (...args: unknown[]) => unknown;
  Path2D: new (...args: unknown[]) => unknown;
};

function loadCanvasPolyfillModule() {
  return Function(
    "nodeRequire",
    "moduleName",
    "return nodeRequire(moduleName);",
  )(require, CANVAS_MODULE_NAME) as CanvasPolyfillModule;
}

function configurePdfWorker() {
  if (didConfigurePdfWorker) {
    return;
  }

  const candidateWorkerPaths = [
    path.join(
      process.cwd(),
      "node_modules",
      "pdf-parse",
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    ),
    path.join(
      process.cwd(),
      "node_modules",
      "pdfjs-dist",
      "legacy",
      "build",
      "pdf.worker.min.mjs",
    ),
  ];

  const workerPath = candidateWorkerPaths.find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (workerPath) {
    PDFParse.setWorker(pathToFileURL(workerPath).href);
  }

  didConfigurePdfWorker = true;
}

function configureOcrDomPolyfills() {
  if (didConfigureOcrDomPolyfills || typeof global === "undefined") {
    return;
  }

  const { DOMMatrix, ImageData, Path2D } = loadCanvasPolyfillModule();

  if (
    typeof (global.DOMMatrix as typeof DOMMatrix | undefined) === "undefined"
  ) {
    (global as { DOMMatrix?: typeof DOMMatrix }).DOMMatrix = DOMMatrix;
  }

  if (
    typeof (global.ImageData as typeof ImageData | undefined) === "undefined"
  ) {
    (global as { ImageData?: typeof ImageData }).ImageData = ImageData;
  }

  if (typeof (global.Path2D as typeof Path2D | undefined) === "undefined") {
    (global as { Path2D?: typeof Path2D }).Path2D = Path2D;
  }

  didConfigureOcrDomPolyfills = true;
}

function pickBestPageText(nativeText: string, ocrText: string) {
  if (!ocrText) {
    return nativeText;
  }

  if (!nativeText) {
    return ocrText;
  }

  const normalizedNativeText = normalizeExtractedText(nativeText).toLowerCase();
  const normalizedOcrText = normalizeExtractedText(ocrText).toLowerCase();

  if (normalizedNativeText.includes(normalizedOcrText)) {
    return nativeText;
  }

  if (normalizedOcrText.includes(normalizedNativeText)) {
    return ocrText;
  }

  return ocrText.length > nativeText.length * 1.15 ? ocrText : nativeText;
}

function isPdfJsTextItem(
  value: unknown,
): value is {
  str: string;
  hasEOL?: boolean;
} {
  return Boolean(
    value &&
      typeof value === "object" &&
      "str" in value &&
      typeof value.str === "string",
  );
}

function normalizePdfJsPageText(items: unknown[]) {
  const parts: string[] = [];

  for (const item of items) {
    if (!isPdfJsTextItem(item)) {
      continue;
    }

    const text = item.str.trim();

    if (!text) {
      continue;
    }

    parts.push(text);
    parts.push(item.hasEOL ? "\n" : " ");
  }

  return normalizeExtractedText(parts.join(""));
}

async function extractNativeTextWithPdfParse(
  buffer: Uint8Array,
): Promise<NativePdfExtraction> {
  configurePdfWorker();

  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    const extractedPages = result.pages.map((page) => ({
      pageNumber: page.num,
      text: normalizeExtractedText(page.text),
    }));
    const pageCount =
      result.total ||
      Math.max(
        1,
        ...extractedPages.map((page) => page.pageNumber),
      );
    const pages = Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: normalizeExtractedText(
        extractedPages.find((page) => page.pageNumber === index + 1)?.text ?? "",
      ),
    })).filter((page) => page.text.length > 0);

    return {
      text: normalizeExtractedText(
        pages.map((page) => page.text).join("\n\n") || result.text || "",
      ),
      pageCount,
      pages,
    };
  } finally {
    await parser.destroy();
  }
}

async function extractNativeTextWithPdfJs(
  buffer: Uint8Array,
): Promise<NativePdfExtraction> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    useWasm: false,
  });
  const pdfDocument = await loadingTask.promise;

  try {
    const pages: ParsedPdfPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);

      try {
        const textContent = await page.getTextContent();
        const text = normalizePdfJsPageText(textContent.items);

        if (text) {
          pages.push({
            pageNumber,
            text,
          });
        }
      } finally {
        page.cleanup();
      }
    }

    return {
      text: normalizeExtractedText(pages.map((page) => page.text).join("\n\n")),
      pageCount: pdfDocument.numPages,
      pages,
    };
  } finally {
    await loadingTask.destroy();
  }
}

export async function parsePdfFile(filePath: string): Promise<ParsedPdfDocument> {
  const buffer = await readFile(filePath);
  const pdfData = new Uint8Array(buffer);

  let nativeExtraction: NativePdfExtraction;

  try {
    nativeExtraction = await extractNativeTextWithPdfParse(pdfData);
  } catch (pdfParseError) {
    console.warn(
      "pdf-parse extraction failed, retrying with direct PDF.js text extraction.",
      pdfParseError,
    );
    nativeExtraction = await extractNativeTextWithPdfJs(pdfData);
  }

  const pageTexts = new Map<number, string>();

  for (const page of nativeExtraction.pages) {
    pageTexts.set(page.pageNumber, page.text);
  }

  const pageNumbersNeedingOcr = Array.from(
    { length: nativeExtraction.pageCount },
    (_, index) => index + 1,
  ).filter(
    (pageNumber) =>
      (pageTexts.get(pageNumber) ?? "").length <
      MIN_PAGE_CHARACTERS_FOR_NATIVE_TEXT,
  );

  let ocrRecoveredPageCount = 0;

  if (pageNumbersNeedingOcr.length > 0) {
    try {
      configureOcrDomPolyfills();

      const ocrPages = await extractPdfPagesWithOcr(
        pdfData,
        pageNumbersNeedingOcr,
      );

      for (const ocrPage of ocrPages) {
        const nextPageText = pickBestPageText(
          pageTexts.get(ocrPage.pageNumber) ?? "",
          ocrPage.text,
        );

        pageTexts.set(ocrPage.pageNumber, nextPageText);

        if (nextPageText.length >= MIN_PAGE_CHARACTERS_FOR_NATIVE_TEXT) {
          ocrRecoveredPageCount += 1;
        }
      }
    } catch (error) {
      console.error("PDF OCR Failure:", error);
    }
  }

  const pages = Array.from({ length: nativeExtraction.pageCount }, (_, index) => ({
    pageNumber: index + 1,
    text: normalizeExtractedText(pageTexts.get(index + 1) ?? ""),
  })).filter((page) => page.text.length > 0);

  return buildParsedPdfDocument(
    pages,
    nativeExtraction.pageCount,
    ocrRecoveredPageCount > 0 ? "ocr" : undefined,
  );
}
