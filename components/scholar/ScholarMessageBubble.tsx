"use client";

import MessageBubble from "@/components/MessageBubble";
import type { ChatSource } from "@/lib/types";
import type { ScholarMockTest } from "@/lib/scholar/schema";

import ScholarTestCard from "./ScholarTestCard";

type ScholarMessageBubbleProps = {
  role: "user" | "assistant";
  markdown: string;
  sources?: ChatSource[];
  test?: ScholarMockTest;
  highlight?: boolean;
};

export default function ScholarMessageBubble({
  role,
  markdown,
  sources = [],
  test,
  highlight = false,
}: ScholarMessageBubbleProps) {
  if (role === "user") {
    return <MessageBubble role={role} text={markdown} />;
  }

  return (
    <div className="space-y-4">
      <MessageBubble
        role="assistant"
        text={markdown}
        sources={sources}
        highlight={highlight}
      />
      {test ? <ScholarTestCard test={test} /> : null}
    </div>
  );
}
