import { postSseStream } from "../request/stream";

export type ChatStreamEvent =
  | { type: "tool_start"; tool: string; input: string }
  | { type: "tool_end"; tool: string; output: string }
  | { type: "text"; content: string };

export interface StreamChatOptions {
  message: string;
  sessionId: string;
  onEvent: (event: ChatStreamEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export function streamChat({
  message,
  sessionId,
  onEvent,
  onDone,
  onError,
}: StreamChatOptions): AbortController {
  return postSseStream<ChatStreamEvent>({
    path: "/chat/stream",
    body: { message, session_id: sessionId },
    onEvent,
    onDone,
    onError,
  });
}
