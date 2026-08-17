import { postSseStream } from "../request/stream.js";
import { toStreamChatBody } from "./history.js";

export type ChatStage =
  | "received"
  | "planning"
  | "tooling"
  | "answering"
  | "completed";

export type ChatStreamEventBase = { runId?: string };

export type ChatStreamEvent =
  | ({ type: "stage"; stage: ChatStage; message: string } & ChatStreamEventBase)
  | ({
      type: "tool_start";
      tool: string;
      input: string;
      run_id?: string;
    } & ChatStreamEventBase)
  | ({
      type: "tool_end";
      tool: string;
      output: string;
      elapsed_ms?: number;
      run_id?: string;
    } & ChatStreamEventBase)
  | ({ type: "text"; content: string } & ChatStreamEventBase)
  | ({ type: "error"; message: string } & ChatStreamEventBase);

export interface StreamChatOptions {
  userId: string;
  message: string;
  sessionId: string;
  onEvent: (event: ChatStreamEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

export function streamChat({
  userId,
  message,
  sessionId,
  onEvent,
  onDone,
  onError,
}: StreamChatOptions): AbortController {
  return postSseStream<ChatStreamEvent>({
    path: "/chat/stream",
    body: toStreamChatBody({ userId, sessionId, message }),
    onEvent,
    onDone,
    onError,
  });
}
