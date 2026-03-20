import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  ensurePrivateUploadAvailable,
  isUserUploadUrl,
  resolveUserUploadsRoot,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const fileUrl = searchParams.get("path")?.trim();

    if (!fileUrl) {
      return NextResponse.json(
        { error: "A file path is required." },
        { status: 400 },
      );
    }

    if (!isUserUploadUrl(session.userId, fileUrl)) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 },
      );
    }

    const fileName = path.basename(fileUrl);
    const uploadsRoot = resolveUserUploadsRoot(session.userId);
    const filePath = await ensurePrivateUploadAvailable(
      session.userId,
      fileName,
    );
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(uploadsRoot))) {
      return NextResponse.json(
        { error: "Access denied." },
        { status: 403 },
      );
    }

    if (!existsSync(resolvedPath)) {
      return NextResponse.json(
        { error: "File not found." },
        { status: 404 },
      );
    }

    const fileBuffer = await readFile(resolvedPath);
    const fileStats = await stat(resolvedPath);

    return new Response(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(fileStats.size),
        "Content-Disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("File serve route error:", error);

    return NextResponse.json(
      { error: "Unable to serve the requested file." },
      { status: 500 },
    );
  }
}
