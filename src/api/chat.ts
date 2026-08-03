import { postSseStream } from "../request/stream.js";

export type ChatStage =
  | "received"
  | "planning"
  | "tooling"
  | "answering"
  | "completed";

export type ChatStreamEvent =
  | { type: "stage"; stage: ChatStage; message: string }
  | { type: "tool_start"; tool: string; input: string; run_id?: string }
  | {
      type: "tool_end";
      tool: string;
      output: string;
      elapsed_ms?: number;
      run_id?: string;
    }
  | { type: "text"; content: string }
  | { type: "error"; message: string };

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
