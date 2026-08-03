import { streamChat, type ChatStreamEvent } from "./chat";
import { API_BASE_URL } from "../config/env";
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  finishAgentMessage,
} from "../chat/workTimeline";

const events: ChatStreamEvent[] = [
  { type: "stage", stage: "received", message: "已收到问题" },
  { type: "stage", stage: "planning", message: "正在判断是否需要工具" },
  { type: "stage", stage: "tooling", message: "正在调用 calculator" },
  { type: "tool_start", tool: "calculator", input: "{'expression': '2+3'}" },
  { type: "tool_end", tool: "calculator", output: "2+3 = 5", elapsed_ms: 42 },
  { type: "stage", stage: "answering", message: "正在整理最终回答" },
  { type: "text", content: "答案是 5" },
  { type: "stage", stage: "completed", message: "已完成" },
  { type: "error", message: "网络异常" },
];

let message = createPendingAgentMessage("agent-contract");
for (const event of events) {
  message = appendChatStreamEvent(message, event);
}
message = finishAgentMessage(message);

const finalContent: string = message.content;
const currentStatus: string = message.currentStatus;
const timelineLength: number = message.timeline.length;

const controller = streamChat({
  message: "hello",
  sessionId: "session_contract",
  onEvent: (streamEvent) => {
    const eventType: ChatStreamEvent["type"] = streamEvent.type;
    void eventType;
  },
  onDone: () => {},
  onError: (errorMessage) => {
    const readableMessage: string = errorMessage;
    void readableMessage;
  },
});

controller.abort();

void finalContent;
void currentStatus;
void timelineLength;
void API_BASE_URL;
