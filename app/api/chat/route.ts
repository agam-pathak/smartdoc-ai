import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";
import { ALL_DOCUMENTS_SCOPE_ID } from "@/lib/chat-constants";
import {
  getConversation,
  persistConversationExchange,
  summarizeConversation,
} from "@/lib/conversations";
import { CHAT_MODEL, getGroqClient } from "@/lib/embeddings";
import { buildContext, retrieveRelevantChunks, toChatSources } from "@/lib/search";
import { getDocument, getDocuments } from "@/lib/vectorStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SYSTEM_PROMPT = `You are a premium AI research assistant. You answer questions strictly using the provided document context.

CRITICAL INSTRUCTIONS:
1. You MUST use inline citations, referring to the Context number in brackets.
   For example, if you learn something from Context 1, append [1] immediately after the sentence.
   Like this: "The company's revenue increased by 20% [1]."
2. If the answer spans multiple facts, cite them all: "Factor A [1] and Factor B [2]."
3. If the answer is not present in the context, say that the information is not available and do NOT guess.
4. AT THE END of your entire response, you MUST suggest exactly 3 relevant follow-up questions to continue the exploration. Output them like this on a new line:
<followups>
Can you explain the first point?
What is the impact of the second factor?
How does this compare to the previous year?
</followups>`;

function formatPageRange(pageStart: number, pageEnd: number) {
  return pageStart === pageEnd
    ? `page ${pageStart}`
    : `pages ${pageStart}-${pageEnd}`;
}

function buildExtractiveFallbackAnswer(
  question: string,
  sources: ReturnType<typeof toChatSources>,
) {
  const evidence = sources
    .slice(0, 3)
    .map(
      (source, index) =>
        `${index + 1}. ${source.source} (${formatPageRange(
          source.pageStart,
          source.pageEnd,
        )})\n${source.excerpt}`,
    )
    .join("\n\n");

  return [
    "The language model is unavailable right now, so this answer is based directly on the closest retrieved evidence.",
    `Question: ${question}`,
    evidence ? `Relevant evidence:\n${evidence}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function stripFollowupsBlock(text: string) {
  return text.replace(/<followups>[\s\S]*?<\/followups>/g, "").trim();
}

function buildChatMessages({
  history,
  context,
  question,
}: {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  context: string;
  question: string;
}) {
  return [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT,
    },
    ...history,
    {
      role: "user" as const,
      content: `Retrieved context for the current question:\n${context}\n\nCurrent question:\n${question}`,
    },
  ];
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

    const body = await request.json();
    const question =
      typeof body.question === "string" ? body.question.trim() : "";
    const documentId =
      typeof body.documentId === "string" ? body.documentId.trim() : "";
    const conversationId =
      typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const searchMode = body.searchMode === "all" ? "all" : "document";

    if (searchMode === "document" && !documentId) {
      return NextResponse.json(
        { error: "A document must be selected before asking a question." },
        { status: 400 },
      );
    }

    if (!question) {
      return NextResponse.json(
        { error: "A question is required." },
        { status: 400 },
      );
    }

    const document = documentId
      ? await getDocument(session.userId, documentId)
      : null;

    if (searchMode === "document" && !document) {
      return NextResponse.json(
        { error: "The selected document could not be found." },
        { status: 404 },
      );
    }

    if (searchMode === "all") {
      const indexedDocuments = await getDocuments(session.userId);

      if (indexedDocuments.length === 0) {
        return NextResponse.json(
          { error: "No indexed documents are available for search." },
          { status: 400 },
        );
      }
    }

    const conversationScopeId =
      searchMode === "all" ? ALL_DOCUMENTS_SCOPE_ID : documentId;
    const existingConversation = conversationId
      ? await getConversation(session.userId, conversationId)
      : null;

    if (conversationId && !existingConversation) {
      return NextResponse.json(
        { error: "The selected conversation could not be found." },
        { status: 404 },
      );
    }

    if (
      existingConversation &&
      existingConversation.documentId !== conversationScopeId
    ) {
      return NextResponse.json(
        { error: "The selected conversation does not match this search scope." },
        { status: 400 },
      );
    }

    const retrievedChunks = await retrieveRelevantChunks({
      userId: session.userId,
      documentId: searchMode === "document" ? documentId : undefined,
      question,
      embeddingModel: document?.embeddingModel,
      topK: searchMode === "all" ? 6 : 4,
      searchMode,
    });

    const unavailableMessage =
      searchMode === "all"
        ? "The information is not available in the indexed documents."
        : "The information is not available in this document.";

    if (retrievedChunks.length === 0) {
      const conversation = await persistConversationExchange({
        userId: session.userId,
        conversationId: conversationId || undefined,
        documentId:
          searchMode === "all" ? ALL_DOCUMENTS_SCOPE_ID : documentId,
        question,
        answer: unavailableMessage,
      });

      return NextResponse.json({
        answer: unavailableMessage,
        sources: [],
        document,
        conversation: summarizeConversation(conversation),
        searchMode,
        responseMode: "no-results",
      });
    }

    const context = buildContext(retrievedChunks);
    const sources = toChatSources(retrievedChunks);
    const history = (existingConversation?.messages ?? [])
      .slice(-6)
      .map((message) => ({
        role: message.role,
        content: stripFollowupsBlock(message.text),
      }));
    const chatMessages = buildChatMessages({
      history,
      context,
      question,
    });

    // Try streaming response
    try {
      const groq = getGroqClient();

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          // Send sources first
          controller.enqueue(
            encoder.encode(sseEvent({ type: "sources", sources })),
          );

          let fullAnswer = "";

          try {
            const completion = await groq.chat.completions.create({
              model: CHAT_MODEL,
              temperature: 0.2,
              stream: true,
              messages: chatMessages,
            });

            for await (const chunk of completion) {
              const delta = chunk.choices[0]?.delta?.content;

              if (delta) {
                fullAnswer += delta;
                controller.enqueue(
                  encoder.encode(sseEvent({ type: "delta", text: delta })),
                );
              }
            }

            if (!fullAnswer.trim()) {
              fullAnswer = unavailableMessage;
            }
          } catch (llmError) {
            console.warn("Groq streaming unavailable, using extractive fallback.", llmError);
            fullAnswer = buildExtractiveFallbackAnswer(question, sources);
            controller.enqueue(
              encoder.encode(
                sseEvent({ type: "delta", text: fullAnswer }),
              ),
            );
          }

          // Persist the conversation
          const conversation = await persistConversationExchange({
            userId: session.userId,
            conversationId: conversationId || undefined,
            documentId:
              searchMode === "all" ? ALL_DOCUMENTS_SCOPE_ID : documentId,
            question,
            answer: fullAnswer,
            sources,
          });

          // Send final event
          controller.enqueue(
            encoder.encode(
              sseEvent({
                type: "done",
                answer: fullAnswer,
                conversation: summarizeConversation(conversation),
                searchMode,
              }),
            ),
          );

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (error) {
      // Fallback: non-streaming JSON response if Groq client fails to initialize
      console.warn("Streaming unavailable, using JSON fallback.", error);

      let answer = unavailableMessage;

      try {
        const groq = getGroqClient();
        const completion = await groq.chat.completions.create({
          model: CHAT_MODEL,
          temperature: 0.2,
          messages: chatMessages,
        });
        answer =
          completion.choices[0]?.message?.content?.trim() || unavailableMessage;
      } catch (llmError) {
        console.warn("Groq chat unavailable, using extractive fallback.", llmError);
        answer = buildExtractiveFallbackAnswer(question, sources);
      }

      const conversation = await persistConversationExchange({
        userId: session.userId,
        conversationId: conversationId || undefined,
        documentId:
          searchMode === "all" ? ALL_DOCUMENTS_SCOPE_ID : documentId,
        question,
        answer,
        sources,
      });

      return NextResponse.json({
        answer,
        sources,
        document,
        conversation: summarizeConversation(conversation),
        searchMode,
        responseMode: "fallback",
      });
    }
  } catch (error) {
    console.error("Chat route error:", error);

    return NextResponse.json(
      { error: "The question could not be processed." },
      { status: 500 },
    );
  }
}
