import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { deleteConversationsForDocument } from "@/lib/conversations";
import { deleteDocument, updateDocumentMetadata } from "@/lib/vectorStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    documentId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { documentId } = await params;
    const body = await request.json();
    const bookmarkedPages = Array.isArray(body.bookmarkedPages)
      ? body.bookmarkedPages
      : undefined;
    const notes = typeof body.notes === "string" ? body.notes : undefined;
    const lastOpenedAt =
      typeof body.lastOpenedAt === "string" ? body.lastOpenedAt : undefined;

    const document = await updateDocumentMetadata(session.userId, documentId, {
      bookmarkedPages,
      notes,
      lastOpenedAt,
    });

    if (!document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ document });
  } catch (error) {
    console.error("Update document route error:", error);

    return NextResponse.json(
      { error: "The document could not be updated." },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { documentId } = await params;
    const document = await deleteDocument(session.userId, documentId);

    if (!document) {
      return NextResponse.json(
        { error: "Document not found." },
        { status: 404 },
      );
    }

    const deletedConversationCount =
      await deleteConversationsForDocument(session.userId, documentId);

    return NextResponse.json({
      message: "Document deleted successfully.",
      document,
      deletedConversationCount,
    });
  } catch (error) {
    console.error("Delete document route error:", error);

    return NextResponse.json(
      { error: "The document could not be deleted." },
      { status: 500 },
    );
  }
}
