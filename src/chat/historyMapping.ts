import type { ChatStreamEvent } from "../api/chat.js";
import type {
  AgentRunDto,
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
    candidate.type === "stopped" ||
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

    if (message.runStatus === "stopped") {
      const stoppedMessage = appendChatStreamEvent(
        createPendingAgentMessage(message.messageId),
        message.runId
          ? { type: "stopped", message: "已停止", runId: message.runId }
          : { type: "stopped", message: "已停止" },
      );
      return {
        ...stoppedMessage,
        content: message.content,
      };
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
  runStatus?: AgentRunDto["status"],
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

  if (runStatus === "stopped" && !message.stopped) {
    message = appendChatStreamEvent(message, {
      type: "stopped",
      message: "已停止",
      runId,
    });
  }

  return {
    ...finishAgentMessage(message),
    runId,
  };
}
