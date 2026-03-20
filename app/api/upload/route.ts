import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  resolveUserUploadFilePath,
  resolveUserUploadUrl,
  resolveUserUploadsRoot,
} from "@/lib/storage";
import { indexDocument } from "@/lib/vectorStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;

function sanitizePdfFilename(originalName: string) {
  const baseName = path.basename(originalName, path.extname(originalName));
  const safeBaseName = baseName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);

  return `${safeBaseName || "document"}-${Date.now()}.pdf`;
}

function getDisplayName(originalName: string) {
  return path.basename(originalName, path.extname(originalName)).trim() || "Untitled document";
}

export async function POST(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const formData = await request.formData();
    const uploadedFile = formData.get("file");

    if (!(uploadedFile instanceof File)) {
      return NextResponse.json(
        { error: "No PDF file was uploaded." },
        { status: 400 },
      );
    }

    const isPdfExtension = uploadedFile.name.toLowerCase().endsWith(".pdf");
    const isPdfMimeType =
      uploadedFile.type === "application/pdf" || uploadedFile.type === "";

    if (!isPdfExtension || !isPdfMimeType) {
      return NextResponse.json(
        { error: "Only PDF uploads are allowed." },
        { status: 400 },
      );
    }

    if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "The PDF exceeds the 15 MB upload limit.",
        },
        { status: 413 },
      );
    }

    const safeFileName = sanitizePdfFilename(uploadedFile.name);
    const uploadsDirectory = resolveUserUploadsRoot(session.userId);
    const fileUrl = resolveUserUploadUrl(session.userId, safeFileName);
    const filePath = resolveUserUploadFilePath(session.userId, safeFileName);
    const buffer = Buffer.from(await uploadedFile.arrayBuffer());

    await mkdir(uploadsDirectory, { recursive: true });
    await writeFile(filePath, buffer);

    const document = await indexDocument({
      userId: session.userId,
      documentId: randomUUID(),
      name: getDisplayName(uploadedFile.name),
      fileName: safeFileName,
      fileUrl,
      sizeBytes: buffer.byteLength,
    });

    return NextResponse.json(
      {
        message: "Document uploaded and indexed successfully.",
        document,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Upload indexing error:", error);

    return NextResponse.json(
      {
        error: "The document could not be uploaded and indexed.",
      },
      { status: 500 },
    );
  }
}
