import type { ChatStreamEvent } from "../api/chat.js";
import type {
  PersistedChatMessageDto,
  StoredRunEventDto,
} from "../api/history.js";
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  createUserMessage,
  finishAgentMessage,
  type AgentChatMessage,
  type ChatMessage,
} from "./workTimeline.js";

function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown };
  return (
    candidate.type === "stage" ||
    candidate.type === "tool_start" ||
    candidate.type === "tool_end" ||
    candidate.type === "text" ||
    candidate.type === "error"
  );
}

export function mapPersistedMessages(
  messages: PersistedChatMessageDto[],
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role === "user") {
      return createUserMessage(message.messageId, message.content);
    }

    return {
      ...finishAgentMessage(createPendingAgentMessage(message.messageId)),
      content: message.content,
      runId: message.runId,
    };
  });
}

export function replayRunEvents(
  runId: string,
  events: StoredRunEventDto[],
): AgentChatMessage {
  const sortedEvents = [...events].sort(
    (left, right) => left.sequence - right.sequence,
  );
  let message = createPendingAgentMessage(`run-trace-${runId}`);

  for (const event of sortedEvents) {
    if (isChatStreamEvent(event.payload)) {
      message = appendChatStreamEvent(message, event.payload);
    }
  }

  return {
    ...finishAgentMessage(message),
    runId,
  };
}
