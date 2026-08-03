import assert from "node:assert/strict";

import {
  appendChatStreamEvent,
  createPendingAgentMessage,
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

console.log("workTimeline contracts passed");
