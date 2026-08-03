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
  {
    type: "tool_start",
    tool: "calculator",
    input: "{'expression': '2+3'}",
    run_id: "calculator-run-1",
  },
  {
    type: "tool_end",
    tool: "calculator",
    output: "2+3 = 5",
    elapsed_ms: 42,
    run_id: "calculator-run-1",
  },
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

const streamOptions = {
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
} satisfies Parameters<typeof streamChat>[0];

function assertContract(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

let parallelMessage = createPendingAgentMessage("agent-parallel-contract");
parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "tool_start",
  tool: "search",
  input: "alpha",
  run_id: "search-run-a",
});
parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "stage",
  stage: "tooling",
  message: "正在调用第二个 search",
});
parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "tool_start",
  tool: "search",
  input: "beta",
  run_id: "search-run-b",
});
parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "stage",
  stage: "answering",
  message: "正在整理最终回答",
});

const runningTools = parallelMessage.timeline.filter((item) => item.kind === "tool");
assertContract(
  runningTools.length === 2 && runningTools.every((item) => item.status === "running"),
  "parallel tool starts must remain running independently",
);

parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "tool_end",
  tool: "search",
  output: "alpha result",
  run_id: "search-run-a",
});
const firstCompletedTools = parallelMessage.timeline.filter(
  (item) => item.kind === "tool",
);
assertContract(
  firstCompletedTools[0]?.status === "completed" &&
    firstCompletedTools[0].runId === "search-run-a" &&
    firstCompletedTools[0].output === "alpha result" &&
    firstCompletedTools[1]?.status === "running",
  "tool_end must complete only its matching run_id",
);
parallelMessage = appendChatStreamEvent(parallelMessage, {
  type: "tool_end",
  tool: "search",
  output: "beta result",
  run_id: "search-run-b",
});
const completedTools = parallelMessage.timeline.filter((item) => item.kind === "tool");
assertContract(
  completedTools.length === 2 &&
    completedTools.every((item) => item.status === "completed") &&
    completedTools[1]?.output === "beta result",
  "parallel tool runs must complete independently",
);

let legacyMessage = createPendingAgentMessage("agent-legacy-contract");
legacyMessage = appendChatStreamEvent(legacyMessage, {
  type: "tool_start",
  tool: "calculator",
  input: "2+3",
});
legacyMessage = appendChatStreamEvent(legacyMessage, {
  type: "tool_end",
  tool: "calculator",
  output: "5",
});
assertContract(
  legacyMessage.timeline.some(
    (item) => item.kind === "tool" && item.output === "5" && item.status === "completed",
  ),
  "legacy tool events without run_id must still match",
);

let partialErrorMessage = createPendingAgentMessage("agent-error-contract");
partialErrorMessage = appendChatStreamEvent(partialErrorMessage, {
  type: "tool_start",
  tool: "search",
  input: "unfinished",
  run_id: "search-run-error",
});
partialErrorMessage = appendChatStreamEvent(partialErrorMessage, {
  type: "text",
  content: "partial answer",
});
partialErrorMessage = appendChatStreamEvent(partialErrorMessage, {
  type: "error",
  message: "safe error",
});
assertContract(
  partialErrorMessage.content === "partial answer" &&
    partialErrorMessage.error === "safe error" &&
    partialErrorMessage.timeline.some(
      (item) => item.kind === "tool" && item.status === "failed",
    ),
  "stream errors must preserve partial answer content",
);

void streamOptions;
void finalContent;
void currentStatus;
void timelineLength;
void API_BASE_URL;
