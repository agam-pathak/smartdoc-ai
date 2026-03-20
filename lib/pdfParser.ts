import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { PDFParse } from "pdf-parse";

import type { ParsedPdfPage } from "@/lib/types";

type ParsedPdfDocument = {
  text: string;
  pageCount: number;
  pages: ParsedPdfPage[];
  extractionMode: "text" | "ocr-recommended";
};

let didConfigurePdfWorker = false;

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

export async function parsePdfFile(filePath: string): Promise<ParsedPdfDocument> {
  configurePdfWorker();

  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(buffer) });

  try {
    const result = await parser.getText();
    const pages = result.pages
      .map((page) => ({
        pageNumber: page.num,
        text: normalizeExtractedText(page.text),
      }))
      .filter((page) => page.text.length > 0);

    const text = normalizeExtractedText(
      pages.map((page) => page.text).join("\n\n") || result.text || "",
    );
    const averageCharactersPerPage =
      pages.length > 0 ? text.length / pages.length : text.length;
    const extractionMode =
      text.length === 0 || averageCharactersPerPage < 80
        ? "ocr-recommended"
        : "text";

    return {
      text,
      pageCount: result.total || pages.length,
      extractionMode,
      pages:
        pages.length > 0
          ? pages
          : [
              {
                pageNumber: 1,
                text:
                  extractionMode === "ocr-recommended"
                    ? "This PDF appears to contain image-based or scanned pages. OCR is recommended before grounded answers can extract detailed content."
                    : text,
              },
            ],
    };
  } finally {
    await parser.destroy();
  }
}
