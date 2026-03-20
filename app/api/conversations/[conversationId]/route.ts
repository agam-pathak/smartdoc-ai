import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import {
  deleteConversation,
  duplicateConversation,
  getConversation,
  renameConversation,
  summarizeConversation,
  updateConversationMetadata,
} from "@/lib/conversations";
import { CHAT_MODEL, getGroqClient } from "@/lib/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

function stripFollowups(text: string) {
  return text.replace(/<followups>[\s\S]*?<\/followups>/g, "").trim();
}

function buildFallbackSummary(
  conversation: NonNullable<Awaited<ReturnType<typeof getConversation>>>,
) {
  const userPrompts = conversation.messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => `- ${message.text}`);
  const assistantReplies = conversation.messages.filter(
    (message) => message.role === "assistant",
  );
  const citedResponses = assistantReplies.filter(
    (message) => (message.sources?.length ?? 0) > 0,
  ).length;

  return [
    `Thread: ${conversation.title}`,
    `Messages: ${conversation.messages.length}`,
    `Cited replies: ${citedResponses}`,
    userPrompts.length > 0 ? "Recent user prompts:" : "",
    ...userPrompts,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { conversationId } = await params;
    const conversation = await getConversation(session.userId, conversationId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ conversation });
  } catch (error) {
    console.error("Conversation detail route error:", error);

    return NextResponse.json(
      { error: "Unable to load the conversation." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { conversationId } = await params;
    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const pinned =
      typeof body.pinned === "boolean" ? body.pinned : undefined;

    if (!title && typeof pinned !== "boolean") {
      return NextResponse.json(
        { error: "A title or pinned state is required." },
        { status: 400 },
      );
    }

    const conversation = title
      ? await renameConversation(session.userId, conversationId, title)
      : await updateConversationMetadata(session.userId, conversationId, {
          pinned,
        });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({
      conversation: summarizeConversation(conversation),
    });
  } catch (error) {
    console.error("Rename conversation route error:", error);

    return NextResponse.json(
      { error: "The conversation could not be renamed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const { conversationId } = await params;
    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action.trim() : "";

    if (action === "duplicate") {
      const conversation = await duplicateConversation(
        session.userId,
        conversationId,
      );

      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        conversation: summarizeConversation(conversation),
      });
    }

    if (action === "summarize") {
      const conversation = await getConversation(session.userId, conversationId);

      if (!conversation) {
        return NextResponse.json(
          { error: "Conversation not found." },
          { status: 404 },
        );
      }

      const transcript = conversation.messages
        .map((message) => `${message.role.toUpperCase()}: ${stripFollowups(message.text)}`)
        .join("\n\n");

      let summary = buildFallbackSummary(conversation);

      try {
        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
          model: CHAT_MODEL,
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "Summarize the conversation in crisp markdown bullets with sections for key questions, findings, and open follow-ups.",
            },
            {
              role: "user",
              content: transcript,
            },
          ],
        });

        summary =
          completion.choices[0]?.message?.content?.trim() || summary;
      } catch (error) {
        console.warn("Conversation summary fallback in use.", error);
      }

      return NextResponse.json({ summary });
    }

    return NextResponse.json(
      { error: "Unsupported action." },
      { status: 400 },
    );
  } catch (error) {
    console.error("Conversation action route error:", error);

    return NextResponse.json(
      { error: "The conversation action could not be completed." },
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

    const { conversationId } = await params;
    const deleted = await deleteConversation(session.userId, conversationId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ message: "Conversation deleted successfully." });
  } catch (error) {
    console.error("Delete conversation route error:", error);

    return NextResponse.json(
      { error: "The conversation could not be deleted." },
      { status: 500 },
    );
  }
}
