import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  createSessionRequest,
  deleteSession,
  deleteSessionRequest,
  toStreamChatBody,
} from "../src/api/history.js";
import { RunTracePanel } from "../src/chat/RunTracePanel.js";
import { SessionHistoryDialog } from "../src/chat/SessionHistoryDialog.js";
import { SessionSidebar } from "../src/chat/SessionSidebar.js";
import {
  CHAT_MIN_WIDTH,
  RIGHT_RAIL_DEFAULT_WIDTH,
  RIGHT_RAIL_MIN_WIDTH,
  clampChatWidth,
  getDefaultChatWidth,
  getChatWidthBounds,
} from "../src/chat/chatLayout.js";
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

assert.deepEqual(deleteSessionRequest("user-a", "session-a"), {
  path: "/users/user-a/sessions/session-a",
  method: "DELETE",
});

const originalFetch = globalThis.fetch;
try {
  let deleteRequestSeen = false;
  globalThis.fetch = async (input, init) => {
    deleteRequestSeen = true;
    assert.match(String(input), /\/users\/user-a\/sessions\/session-a$/);
    assert.equal(init?.method, "DELETE");
    return new Response(null, { status: 204 });
  };
  await deleteSession("user-a", "session-a");
  assert.equal(deleteRequestSeen, true);
} finally {
  globalThis.fetch = originalFetch;
}

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

const stoppedMapped = mapPersistedMessages([
  {
    messageId: "message-user",
    sessionId: "session-a",
    role: "user",
    content: "hello",
    createdAt: "2026-08-17T00:00:00Z",
  },
  {
    messageId: "message-stopped",
    sessionId: "session-a",
    role: "agent",
    content: "已停止输出。",
    runId: "run-stopped",
    runStatus: "stopped",
    createdAt: "2026-08-17T00:00:01Z",
  },
]);
assert.equal(stoppedMapped[1].role, "agent");
assert.equal(stoppedMapped[1].content, "已停止输出。");
assert.equal(stoppedMapped[1].runId, "run-stopped");
assert.equal(stoppedMapped[1].loading, false);
assert.equal(stoppedMapped[1].stopped, true);

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

const stoppedReplay = replayRunEvents("run-stopped", [
  {
    eventId: "event-1",
    runId: "run-stopped",
    sequence: 1,
    eventType: "stage",
    payload: {
      type: "stage",
      stage: "planning",
      message: "正在判断下一步",
      runId: "run-stopped",
    },
    createdAt: "2026-08-17T00:00:00Z",
  },
  {
    eventId: "event-2",
    runId: "run-stopped",
    sequence: 2,
    eventType: "stopped",
    payload: {
      type: "stopped",
      message: "用户已停止本次运行。",
      runId: "run-stopped",
    },
    createdAt: "2026-08-17T00:00:01Z",
  },
]);
assert.equal(stoppedReplay.loading, false);
assert.equal(stoppedReplay.stopped, true);

const stoppedReplayWithoutEvent = replayRunEvents("run-stopped-empty", [], "stopped");
assert.equal(stoppedReplayWithoutEvent.loading, false);
assert.equal(stoppedReplayWithoutEvent.stopped, true);

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
    onDeleteSession: () => undefined,
    onRetry: () => undefined,
  }),
);
assert.match(sidebarHtml, /聊天记录/);
assert.match(sidebarHtml, /新建/);
assert.match(sidebarHtml, /session-row-active/);
assert.match(sidebarHtml, /删除/);
assert.match(sidebarHtml, /session-delete-action/);
assert.match(sidebarHtml, /disabled=""/);

const historyDialogHtml = renderToStaticMarkup(
  createElement(SessionHistoryDialog, {
    open: true,
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
    actionsDisabled: false,
    onCreateSession: () => undefined,
    onSelectSession: () => undefined,
    onDeleteSession: () => undefined,
    onRetry: () => undefined,
    onClose: () => undefined,
  }),
);
assert.match(historyDialogHtml, /role="dialog"/);
assert.match(historyDialogHtml, /aria-modal="true"/);
assert.match(historyDialogHtml, /聊天记录/);
assert.match(historyDialogHtml, /新建/);
assert.match(historyDialogHtml, /关闭聊天记录/);
assert.match(historyDialogHtml, /第一段聊天/);
assert.match(historyDialogHtml, /session-history-dialog/);

const closedHistoryDialogHtml = renderToStaticMarkup(
  createElement(SessionHistoryDialog, {
    open: false,
    sessions: [],
    loading: false,
    onCreateSession: () => undefined,
    onSelectSession: () => undefined,
    onDeleteSession: () => undefined,
    onRetry: () => undefined,
    onClose: () => undefined,
  }),
);
assert.equal(closedHistoryDialogHtml, "");

const appCss = readFileSync("src/App.css", "utf8");
assert.match(
  appCss,
  /\.session-sidebar,\s*\.capability-panel,\s*\.learning-profile-panel\s*{[^}]*display:\s*grid/s,
);
assert.match(appCss, /\.session-list\s*{[^}]*overflow-y:\s*auto/s);
assert.match(appCss, /\.history-entry-button/);
assert.match(appCss, /\.session-history-backdrop/);
assert.match(appCss, /\.session-history-dialog/);
assert.match(appCss, /\.chat-resize-handle/);
assert.match(appCss, /--chat-panel-width/);
assert.match(appCss, /\.app-shell\s*{[^}]*width:\s*100%/s);
assert.match(appCss, /\.app-shell\s*{[^}]*justify-content:\s*stretch/s);
assert.match(appCss, /minmax\(600px,\s*var\(--chat-panel-width/);
assert.match(appCss, /minmax\(300px,\s*1fr\)/);
assert.match(appCss, /min-width:\s*300px/);

const dialogSource = readFileSync("src/chat/SessionHistoryDialog.tsx", "utf8");
assert.match(dialogSource, /focusableSelector/);
assert.match(dialogSource, /previousFocusedElementRef/);
assert.match(dialogSource, /event\.key === "Tab"/);
assert.match(dialogSource, /event\.shiftKey/);
assert.match(dialogSource, /querySelectorAll/);
assert.match(dialogSource, /previousFocusedElementRef\.current\?\.focus\(\)/);
assert.match(dialogSource, /event\.target === event\.currentTarget/);

const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(appSource, /Promise<boolean>/);
assert.match(
  appSource,
  /handleCreateSession\(\)\.then\(\(created\) => {\s*if \(created\) setHistoryDialogOpen\(false\);/s,
);
assert.match(
  appSource,
  /handleSelectSession\(sessionId\)\.then\(\(selected\) => {\s*if \(selected\) setHistoryDialogOpen\(false\);/s,
);
assert.match(appSource, /aria-valuemin=\{CHAT_MIN_WIDTH\}/);
assert.match(appSource, /aria-valuemax=\{chatWidthBounds\.max\}/);
assert.match(appSource, /aria-valuenow=\{chatWidth\}/);
assert.doesNotMatch(
  appSource,
  /handleCreateSession\(\)\.then\(\(\) => setHistoryDialogOpen\(false\)\)/,
);

assert.equal(CHAT_MIN_WIDTH, 600);
assert.equal(RIGHT_RAIL_MIN_WIDTH, 300);
assert.equal(RIGHT_RAIL_DEFAULT_WIDTH, 420);
assert.deepEqual(getChatWidthBounds(1180), { min: 600, max: 864 });
assert.equal(getDefaultChatWidth(1180), 744);
assert.equal(clampChatWidth(480, 1180), 600);
assert.equal(clampChatWidth(900, 1180), 864);
assert.equal(clampChatWidth(720, 1180), 720);

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

const stoppedRunTraceHtml = renderToStaticMarkup(
  createElement(RunTracePanel, {
    trace: {
      run: {
        runId: "run-stopped",
        sessionId: "session-a",
        userMessageId: "message-user",
        agentMessageId: null,
        status: "stopped",
        prompt: "hello",
        model: "model-a",
        startedAt: "2026-08-17T00:00:00Z",
        endedAt: "2026-08-17T00:00:02Z",
        errorMessage: "用户已停止本次运行。",
      },
      events: [
        {
          eventId: "event-1",
          runId: "run-stopped",
          sequence: 1,
          eventType: "stopped",
          payload: {
            type: "stopped",
            message: "用户已停止本次运行。",
            runId: "run-stopped",
          },
          createdAt: "2026-08-17T00:00:01Z",
        },
      ],
    },
    loading: false,
    onClose: () => undefined,
  }),
);
assert.match(stoppedRunTraceHtml, /stopped/);
assert.match(stoppedRunTraceHtml, /已停止/);

const stoppedRunTraceWithoutEventsHtml = renderToStaticMarkup(
  createElement(RunTracePanel, {
    trace: {
      run: {
        runId: "run-stopped-empty",
        sessionId: "session-a",
        userMessageId: "message-user",
        agentMessageId: "message-agent",
        status: "stopped",
        prompt: "hello",
        model: "model-a",
        startedAt: "2026-08-17T00:00:00Z",
        endedAt: "2026-08-17T00:00:02Z",
        errorMessage: "用户已停止本次运行。",
      },
      events: [],
    },
    loading: false,
    onClose: () => undefined,
  }),
);
assert.match(stoppedRunTraceWithoutEventsHtml, /stopped/);
assert.match(stoppedRunTraceWithoutEventsHtml, /已停止/);

console.log("history contracts passed");
