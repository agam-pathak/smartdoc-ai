import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { LEXORA_ROOT } from "@/lib/storage";
import type { ParsedPdfPage } from "@/lib/types";

const OCR_CACHE_ROOT = path.join(LEXORA_ROOT, "ocr-cache");
const OCR_MAX_RENDER_EDGE = 2200;
const OCR_MIN_SCALE = 1.35;
const OCR_MAX_SCALE = 2.2;
const require = createRequire(import.meta.url);
const CANVAS_MODULE_NAME = ["@napi-rs", "canvas"].join("/");

type CanvasModule = {
  createCanvas: (
    width: number,
    height: number,
  ) => {
    getContext: (contextId: "2d") => {
      fillStyle: string;
      fillRect: (x: number, y: number, width: number, height: number) => void;
    };
    encode: (format: "png") => Promise<Uint8Array>;
  };
};

function loadCanvasModule() {
  return Function(
    "nodeRequire",
    "moduleName",
    "return nodeRequire(moduleName);",
  )(require, CANVAS_MODULE_NAME) as CanvasModule;
}

function normalizeOcrText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function getOcrRenderScale(page: {
  getViewport: (input: { scale: number }) => { width: number; height: number };
}) {
  const baseViewport = page.getViewport({ scale: 1 });
  const longestEdge = Math.max(baseViewport.width, baseViewport.height, 1);

  return Math.max(
    OCR_MIN_SCALE,
    Math.min(OCR_MAX_SCALE, OCR_MAX_RENDER_EDGE / longestEdge),
  );
}

export async function extractPdfPagesWithOcr(
  pdfData: Uint8Array,
  pageNumbers: number[],
): Promise<ParsedPdfPage[]> {
  const targetPages = [...new Set(
    pageNumbers
      .map((pageNumber) => Math.trunc(pageNumber))
      .filter((pageNumber) => pageNumber > 0),
  )].sort((left, right) => left - right);

  if (targetPages.length === 0) {
    return [];
  }

  await mkdir(OCR_CACHE_ROOT, { recursive: true });

  const [{ getDocument }, { OEM, PSM, createWorker }] =
    await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("tesseract.js"),
    ]);
  const { createCanvas } = loadCanvasModule();

  const loadingTask = getDocument({ data: pdfData });
  const pdfDocument = await loadingTask.promise;
  const worker = await createWorker("eng", OEM.LSTM_ONLY, {
    cachePath: OCR_CACHE_ROOT,
    logger: () => undefined,
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: "1",
    });

    const ocrPages: ParsedPdfPage[] = [];

    for (const pageNumber of targetPages) {
      if (pageNumber > pdfDocument.numPages) {
        continue;
      }

      const page = await pdfDocument.getPage(pageNumber);

      try {
        const viewport = page.getViewport({
          scale: getOcrRenderScale(page),
        });
        const width = Math.max(1, Math.ceil(viewport.width));
        const height = Math.max(1, Math.ceil(viewport.height));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);

        await page.render({
          canvas: null,
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        const imageBuffer = Buffer.from(await canvas.encode("png"));
        const { data } = await worker.recognize(imageBuffer, {
          rotateAuto: true,
        });

        ocrPages.push({
          pageNumber,
          text: normalizeOcrText(data.text),
        });
      } finally {
        page.cleanup();
      }
    }

    return ocrPages;
  } finally {
    await worker.terminate();
    await loadingTask.destroy();
  }
}
