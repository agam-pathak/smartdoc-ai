import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ALL_DOCUMENTS_SCOPE_ID } from "@/lib/chat-constants";
import { withFileLock } from "@/lib/file-lock";
import {
  ensureUserWorkspaceDirectories,
  LEGACY_CONVERSATIONS_PATH,
  resolveUserConversationsPath,
} from "@/lib/storage";
import type {
  ChatSource,
  ConversationRecord,
  ConversationSummary,
} from "@/lib/types";

type ConversationsStore = {
  conversations: ConversationRecord[];
  updatedAt: string;
};

type CreateConversationInput = {
  userId: string;
  documentId: string;
  title?: string;
};

type PersistConversationExchangeInput = {
  userId: string;
  conversationId?: string;
  documentId: string;
  question: string;
  answer: string;
  sources?: ChatSource[];
};

function normalizeConversationTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "New conversation";
  }

  return normalized.slice(0, 80);
}

function deriveConversationTitle(question: string) {
  return normalizeConversationTitle(question.replace(/[.?!]+$/, ""));
}

function summarizeConversation(
  conversation: ConversationRecord,
): ConversationSummary {
  const lastMessage = conversation.messages[conversation.messages.length - 1];

  return {
    id: conversation.id,
    documentId: conversation.documentId,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    lastMessagePreview: lastMessage?.text.slice(0, 120).trim() || "No messages yet",
    pinned: conversation.pinned ?? false,
  };
}

function sortConversations(conversations: ConversationRecord[]) {
  return [...conversations].sort(
    (left, right) =>
      Number(Boolean(right.pinned)) - Number(Boolean(left.pinned)) ||
      Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""),
  );
}

async function readConversationsFile(filePath: string) {
  try {
    const contents = await readFile(filePath, "utf8");
    const store = JSON.parse(contents) as ConversationsStore;
    return {
      conversations: sortConversations(store.conversations ?? []),
      updatedAt: store.updatedAt ?? "",
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        conversations: [],
        updatedAt: "",
      };
    }

    throw error;
  }
}

async function readUserStore(userId: string) {
  return readConversationsFile(resolveUserConversationsPath(userId));
}

async function writeUserStore(userId: string, conversations: ConversationRecord[]) {
  const filePath = resolveUserConversationsPath(userId);

  await withFileLock(filePath, async () => {
    await ensureUserWorkspaceDirectories(userId);
    await mkdir(path.dirname(filePath), {
      recursive: true,
    });

    const store: ConversationsStore = {
      conversations: sortConversations(conversations),
      updatedAt: new Date().toISOString(),
    };

    await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  });
}

async function writeLegacyStore(conversations: ConversationRecord[]) {
  await withFileLock(LEGACY_CONVERSATIONS_PATH, async () => {
    const store: ConversationsStore = {
      conversations: sortConversations(conversations),
      updatedAt: new Date().toISOString(),
    };

    await mkdir(path.dirname(LEGACY_CONVERSATIONS_PATH), { recursive: true });
    await writeFile(
      LEGACY_CONVERSATIONS_PATH,
      JSON.stringify(store, null, 2),
      "utf8",
    );
  });
}

export async function migrateLegacyConversationsToUser(userId: string) {
  const userStore = await readUserStore(userId);

  if (userStore.conversations.length > 0) {
    return [];
  }

  const legacyStore = await readConversationsFile(LEGACY_CONVERSATIONS_PATH);

  if (legacyStore.conversations.length === 0) {
    return [];
  }

  await writeUserStore(userId, legacyStore.conversations);
  await writeLegacyStore([]);
  return legacyStore.conversations;
}

export async function getConversationSummaries(
  userId: string,
  documentId?: string,
) {
  const store = await readUserStore(userId);

  return store.conversations
    .filter((conversation) =>
      documentId ? conversation.documentId === documentId : true,
    )
    .map((conversation) => summarizeConversation(conversation));
}

export async function getConversation(userId: string, conversationId: string) {
  const store = await readUserStore(userId);

  return (
    store.conversations.find(
      (conversation) => conversation.id === conversationId,
    ) ?? null
  );
}

export async function createConversation({
  userId,
  documentId,
  title = "New conversation",
}: CreateConversationInput) {
  const now = new Date().toISOString();
  const conversation: ConversationRecord = {
    id: randomUUID(),
    documentId,
    title: normalizeConversationTitle(title),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    messages: [],
  };

  const store = await readUserStore(userId);
  await writeUserStore(userId, [conversation, ...store.conversations]);

  return conversation;
}

export async function persistConversationExchange({
  userId,
  conversationId,
  documentId,
  question,
  answer,
  sources = [],
}: PersistConversationExchangeInput) {
  const store = await readUserStore(userId);
  const now = new Date().toISOString();
  const nextConversations = [...store.conversations];
  const existingConversationIndex = conversationId
    ? nextConversations.findIndex(
        (conversation) => conversation.id === conversationId,
      )
    : -1;

  const conversation =
    existingConversationIndex >= 0
      ? nextConversations[existingConversationIndex]
      : {
          id: conversationId || randomUUID(),
          documentId,
          title: deriveConversationTitle(question),
          createdAt: now,
          updatedAt: now,
          pinned: false,
          messages: [],
        };

  if (conversation.documentId !== documentId) {
    throw new Error("Conversation does not belong to the selected document.");
  }

  if (conversation.messages.length === 0) {
    conversation.title = deriveConversationTitle(question);
  }

  conversation.messages = [
    ...conversation.messages,
    {
      id: randomUUID(),
      role: "user",
      text: question,
      createdAt: now,
    },
    {
      id: randomUUID(),
      role: "assistant",
      text: answer,
      createdAt: now,
      sources,
    },
  ];
  conversation.updatedAt = now;

  if (existingConversationIndex >= 0) {
    nextConversations[existingConversationIndex] = conversation;
  } else {
    nextConversations.unshift(conversation);
  }

  await writeUserStore(userId, nextConversations);

  return conversation;
}

export async function renameConversation(
  userId: string,
  conversationId: string,
  title: string,
) {
  return updateConversationMetadata(userId, conversationId, { title });
}

type UpdateConversationMetadataInput = {
  title?: string;
  pinned?: boolean;
};

export async function updateConversationMetadata(
  userId: string,
  conversationId: string,
  updates: UpdateConversationMetadataInput,
) {
  const store = await readUserStore(userId);
  const nextConversations = [...store.conversations];
  const conversationIndex = nextConversations.findIndex(
    (conversation) => conversation.id === conversationId,
  );

  if (conversationIndex < 0) {
    return null;
  }

  const existingConversation = nextConversations[conversationIndex];
  const updatedConversation: ConversationRecord = {
    ...existingConversation,
    title:
      typeof updates.title === "string"
        ? normalizeConversationTitle(updates.title)
        : existingConversation.title,
    pinned:
      typeof updates.pinned === "boolean"
        ? updates.pinned
        : existingConversation.pinned ?? false,
    updatedAt: new Date().toISOString(),
  };

  nextConversations[conversationIndex] = updatedConversation;
  await writeUserStore(userId, nextConversations);

  return updatedConversation;
}

export async function duplicateConversation(userId: string, conversationId: string) {
  const store = await readUserStore(userId);
  const conversation = store.conversations.find(
    (item) => item.id === conversationId,
  );

  if (!conversation) {
    return null;
  }

  const now = new Date().toISOString();
  const duplicatedConversation: ConversationRecord = {
    ...conversation,
    id: randomUUID(),
    title: normalizeConversationTitle(`${conversation.title} copy`),
    createdAt: now,
    updatedAt: now,
    pinned: false,
    messages: conversation.messages.map((message) => ({
      ...message,
      id: randomUUID(),
    })),
  };

  await writeUserStore(userId, [duplicatedConversation, ...store.conversations]);
  return duplicatedConversation;
}

export async function deleteConversation(userId: string, conversationId: string) {
  const store = await readUserStore(userId);
  const remainingConversations = store.conversations.filter(
    (conversation) => conversation.id !== conversationId,
  );

  if (remainingConversations.length === store.conversations.length) {
    return false;
  }

  await writeUserStore(userId, remainingConversations);
  return true;
}

export async function deleteConversationsForDocument(
  userId: string,
  documentId: string,
) {
  const store = await readUserStore(userId);
  const remainingConversations = store.conversations.filter(
    (conversation) =>
      conversation.documentId !== documentId &&
      !(documentId === ALL_DOCUMENTS_SCOPE_ID &&
        conversation.documentId === ALL_DOCUMENTS_SCOPE_ID),
  );

  const deletedCount = store.conversations.length - remainingConversations.length;

  if (deletedCount > 0) {
    await writeUserStore(userId, remainingConversations);
  }

  return deletedCount;
}

export { summarizeConversation, ALL_DOCUMENTS_SCOPE_ID };
