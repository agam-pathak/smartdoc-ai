import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { coerceParsedPdfDocument } from "@/lib/parsedPdf";
import {
  indexUntrackedUploads,
  reindexAllDocuments,
  reindexDocument,
} from "@/lib/vectorStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const body = await request
      .json()
      .catch(
        () =>
          ({
            documentId: undefined as string | undefined,
            parsedPdf: undefined as unknown,
          }),
      );
    const parsedPdf = coerceParsedPdfDocument(body.parsedPdf);

    if (typeof body.documentId === "string" && body.documentId.trim()) {
      const document = await reindexDocument(
        session.userId,
        body.documentId.trim(),
        parsedPdf,
      );
      const extractionLimited =
        document.chunkCount === 0 &&
        document.extractionMode === "ocr-recommended";

      return NextResponse.json({
        message: extractionLimited
          ? "Document reindexed, but OCR text extraction still did not produce searchable content."
          : "Document reindexed successfully.",
        document,
        warning: extractionLimited
          ? "No searchable text was indexed for this PDF."
          : undefined,
      });
    }

    const indexedUploads = await indexUntrackedUploads(session.userId);
    const reindexedDocuments = await reindexAllDocuments(session.userId);

    return NextResponse.json({
      message: "Index rebuild completed.",
      indexedUploads,
      reindexedDocuments,
    });
  } catch (error) {
    console.error("Index route error:", error);

    return NextResponse.json(
      { error: "The vector index could not be rebuilt." },
      { status: 500 },
    );
  }
}
