import assert from "node:assert/strict";

import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  finishAgentMessage,
  summarizeAgentMessage,
} from "../src/chat/workTimeline.js";

let message = createPendingAgentMessage("parallel-tools");
message = appendChatStreamEvent(message, {
  type: "tool_start",
  tool: "search",
  input: "alpha",
  run_id: "search-a",
});
message = appendChatStreamEvent(message, {
  type: "tool_start",
  tool: "search",
  input: "beta",
  run_id: "search-b",
});

message = appendChatStreamEvent(message, {
  type: "tool_end",
  tool: "search",
  output: "unknown result",
  run_id: "search-unknown",
});

let tools = message.timeline.filter((item) => item.kind === "tool");
assert.deepEqual(
  tools.map(({ runId, status, output }) => ({ runId, status, output })),
  [
    { runId: "search-a", status: "running", output: undefined },
    { runId: "search-b", status: "running", output: undefined },
    { runId: "search-unknown", status: "completed", output: "unknown result" },
  ],
  "an unknown supplied run_id must not complete a same-name running tool",
);

message = appendChatStreamEvent(message, {
  type: "tool_end",
  tool: "search",
  output: "alpha result",
  run_id: "search-a",
});
message = appendChatStreamEvent(message, {
  type: "tool_end",
  tool: "search",
  output: "duplicate alpha result",
  run_id: "search-a",
});

tools = message.timeline.filter((item) => item.kind === "tool");
assert.equal(tools.find((item) => item.runId === "search-b")?.status, "running");
assert.equal(
  tools.filter((item) => item.runId === "search-a" && item.status === "completed").length,
  2,
  "a duplicate supplied run_id must be recorded without completing another run",
);

message = appendChatStreamEvent(message, {
  type: "tool_end",
  tool: "search",
  output: "beta result",
  run_id: "search-b",
});
assert.equal(
  message.timeline.find(
    (item) => item.kind === "tool" && item.runId === "search-b",
  )?.status,
  "completed",
  "matching run_ids must still complete independently",
);

let legacyMessage = createPendingAgentMessage("legacy-tools");
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
assert.equal(
  legacyMessage.timeline.find((item) => item.kind === "tool")?.status,
  "completed",
  "events without run_id must retain name-based fallback",
);

let summaryMessage = createPendingAgentMessage("summary");
summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "stage",
  stage: "received",
  message: "Received your question.",
});
summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "stage",
  stage: "planning",
  message: "Checking what needs to be done.",
});
summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "tool_start",
  tool: "calculator",
  input: "123*456",
  run_id: "calc-1",
});
summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "tool_end",
  tool: "calculator",
  output: "56088",
  elapsed_ms: 42,
  run_id: "calc-1",
});

let summary = summarizeAgentMessage(summaryMessage);
assert.equal(summary.phase, "tooling");
assert.equal(summary.toolCount, 1);
assert.equal(summary.elapsedMs, 42);
assert.deepEqual(
  summary.primaryItems.map(({ label, status }) => ({ label, status })),
  [
    { label: "理解问题", status: "completed" },
    { label: "calculator 已返回结果 · 42 ms", status: "completed" },
  ],
);
assert.equal(summary.shouldCollapseDetails, false);
assert.equal(summary.shouldExpandDetails, false);

summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "text",
  content: "123*456 = 56088",
});
summary = summarizeAgentMessage(summaryMessage);
assert.equal(summary.phase, "answering");
assert.equal(summary.currentLabel, "已拿到结果，正在整理回答");
assert.equal(
  summary.primaryItems.some((item) => item.label === "整理回答"),
  true,
);

summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "stage",
  stage: "answering",
  message: "Writing the answer.",
});
summaryMessage = appendChatStreamEvent(summaryMessage, {
  type: "stage",
  stage: "completed",
  message: "Answer complete.",
});
summaryMessage = finishAgentMessage(summaryMessage);
summary = summarizeAgentMessage(summaryMessage);
assert.equal(summary.phase, "completed");
assert.equal(summary.currentLabel, "回答完成");
assert.equal(summary.shouldCollapseDetails, true);
assert.equal(summary.detailLabel, "查看执行详情 · 4 个阶段 · 1 个工具 · 42 ms");

let failedSummaryMessage = createPendingAgentMessage("summary-error");
failedSummaryMessage = appendChatStreamEvent(failedSummaryMessage, {
  type: "stage",
  stage: "planning",
  message: "Checking what needs to be done.",
});
failedSummaryMessage = appendChatStreamEvent(failedSummaryMessage, {
  type: "error",
  message: "Agent failed",
});
const failedSummary = summarizeAgentMessage(failedSummaryMessage);
assert.equal(failedSummary.phase, "failed");
assert.equal(failedSummary.currentLabel, "请求失败");
assert.equal(failedSummary.shouldExpandDetails, true);
assert.equal(failedSummary.shouldCollapseDetails, false);

console.log("workTimeline contracts passed");
