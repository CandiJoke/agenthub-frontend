import assert from "node:assert/strict";

import { createSessionRequest, toStreamChatBody } from "../src/api/history.js";
import {
  mapPersistedMessages,
  replayRunEvents,
} from "../src/chat/historyMapping.js";
import { getOrCreateUserId } from "../src/session/userIdentity.js";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
const firstUserId = getOrCreateUserId(storage);
const secondUserId = getOrCreateUserId(storage);

assert.match(firstUserId, /^anon_user_/);
assert.equal(secondUserId, firstUserId);

assert.deepEqual(createSessionRequest("user-a"), {
  path: "/users/user-a/sessions",
  method: "POST",
});

assert.deepEqual(
  toStreamChatBody({
    userId: "user-a",
    sessionId: "session-a",
    message: "hello",
  }),
  {
    userId: "user-a",
    sessionId: "session-a",
    message: "hello",
  },
);

const mapped = mapPersistedMessages([
  {
    messageId: "message-user",
    sessionId: "session-a",
    role: "user",
    content: "hello",
    createdAt: "2026-08-17T00:00:00Z",
  },
  {
    messageId: "message-agent",
    sessionId: "session-a",
    role: "agent",
    content: "hi",
    runId: "run-a",
    createdAt: "2026-08-17T00:00:01Z",
  },
]);

assert.equal(mapped[0].id, "message-user");
assert.equal(mapped[0].role, "user");
assert.equal(mapped[1].role, "agent");
assert.equal(mapped[1].content, "hi");
assert.equal(mapped[1].runId, "run-a");
assert.equal(mapped[1].loading, false);

const replayed = replayRunEvents("run-a", [
  {
    eventId: "event-1",
    runId: "run-a",
    sequence: 1,
    eventType: "stage",
    payload: {
      type: "stage",
      stage: "received",
      message: "已收到问题",
      runId: "run-a",
    },
    createdAt: "2026-08-17T00:00:00Z",
  },
  {
    eventId: "event-2",
    runId: "run-a",
    sequence: 2,
    eventType: "text",
    payload: { type: "text", content: "hi", runId: "run-a" },
    createdAt: "2026-08-17T00:00:01Z",
  },
]);

assert.equal(replayed.runId, "run-a");
assert.equal(replayed.content, "hi");
assert.equal(replayed.timeline.some((item) => item.kind === "answer"), true);
assert.equal(replayed.loading, false);

console.log("history contracts passed");
