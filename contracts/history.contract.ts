import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createSessionRequest, toStreamChatBody } from "../src/api/history.js";
import { RunTracePanel } from "../src/chat/RunTracePanel.js";
import { SessionSidebar } from "../src/chat/SessionSidebar.js";
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

class ThrowingStorage {
  getItem(): string | null {
    throw new Error("storage unavailable");
  }

  setItem(): void {
    throw new Error("storage unavailable");
  }
}

const storage = new MemoryStorage();
const firstUserId = getOrCreateUserId(storage);
const secondUserId = getOrCreateUserId(storage);

assert.match(firstUserId, /^anon_user_/);
assert.equal(secondUserId, firstUserId);

const fallbackUserId = getOrCreateUserId(new ThrowingStorage());
const repeatedFallbackUserId = getOrCreateUserId(new ThrowingStorage());
assert.match(fallbackUserId, /^anon_user_/);
assert.equal(repeatedFallbackUserId, fallbackUserId);

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

const sidebarHtml = renderToStaticMarkup(
  createElement(SessionSidebar, {
    sessions: [
      {
        sessionId: "session-a",
        title: "第一段聊天",
        createdAt: "2026-08-17T00:00:00Z",
        updatedAt: "2026-08-17T00:01:00Z",
      },
    ],
    activeSessionId: "session-a",
    loading: false,
    actionsDisabled: true,
    onCreateSession: () => undefined,
    onSelectSession: () => undefined,
    onRetry: () => undefined,
  }),
);
assert.match(sidebarHtml, /聊天记录/);
assert.match(sidebarHtml, /新建/);
assert.match(sidebarHtml, /session-row-active/);
assert.match(sidebarHtml, /disabled=""/);

const appCss = readFileSync("src/App.css", "utf8");
assert.match(appCss, /\.session-sidebar\s*{[^}]*display:\s*grid/s);
assert.match(appCss, /\.session-list\s*{[^}]*overflow-y:\s*auto/s);

const runTraceHtml = renderToStaticMarkup(
  createElement(RunTracePanel, {
    trace: {
      run: {
        runId: "run-a",
        sessionId: "session-a",
        userMessageId: "message-user",
        agentMessageId: "message-agent",
        status: "completed",
        prompt: "hello",
        model: "model-a",
        startedAt: "2026-08-17T00:00:00Z",
        endedAt: "2026-08-17T00:00:02Z",
        errorMessage: null,
      },
      events: [
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
      ],
    },
    loading: false,
    onClose: () => undefined,
  }),
);
assert.match(runTraceHtml, /执行详情/);
assert.match(runTraceHtml, /completed/);
assert.match(runTraceHtml, /回答完成/);

console.log("history contracts passed");
