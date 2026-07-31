# Chat Stream API Request Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `chat/stream` into dedicated `config`, `request`, and `api` frontend layers.

**Architecture:** `src/config/env.ts` owns API base URL normalization. `src/request/stream.ts` owns generic SSE POST transport. `src/api/chat.ts` owns `/chat/stream` payload mapping and event types, while `src/App.tsx` consumes only the chat API.

**Tech Stack:** React 19, TypeScript 6, Vite 8, browser `fetch`, browser `ReadableStream`, native `AbortController`.

## Global Constraints

- Use `VITE_API_BASE_URL` for the backend API base URL.
- Default API base URL is `http://localhost:8001`.
- Keep `.env` and `.env.*` ignored; track `.env.example`.
- Preserve current chat stream event shapes: `tool_start`, `tool_end`, and `text`.
- Preserve current invalid JSON chunk behavior by ignoring invalid SSE JSON payloads.
- Add no new runtime or dev dependencies.
- Use Node `v20.20.0` for verification because current Vite/Oxlint/Rolldown dependencies require `^20.19.0 || >=22.12.0`.

---

### Task 1: Add Config, Request, And Chat API Layers

**Files:**
- Create: `src/api/chat.contract.ts`
- Create: `src/config/env.ts`
- Create: `src/request/stream.ts`
- Create: `src/api/chat.ts`

**Interfaces:**
- Consumes: `import.meta.env.VITE_API_BASE_URL`.
- Produces: `API_BASE_URL: string`, `postSseStream<TEvent>()`, `streamChat(options: StreamChatOptions): AbortController`, `ChatStreamEvent`.

- [ ] **Step 1: Write the failing compile contract**

Create `src/api/chat.contract.ts`:

```ts
import { streamChat, type ChatStreamEvent } from "./chat";
import { API_BASE_URL } from "../config/env";

const event: ChatStreamEvent = { type: "text", content: "hello" };

const controller = streamChat({
  message: "hello",
  sessionId: "session_contract",
  onEvent: (streamEvent) => {
    const eventType: ChatStreamEvent["type"] = streamEvent.type;
    void eventType;
  },
  onDone: () => {},
  onError: (errorMessage) => {
    const message: string = errorMessage;
    void message;
  },
});

controller.abort();

void event;
void API_BASE_URL;
```

- [ ] **Step 2: Run typecheck to verify it fails**

Run:

```bash
/Users/caisufang/.nvm/versions/node/v20.20.0/bin/node node_modules/typescript/bin/tsc -b
```

Expected: FAIL with missing module errors for `./chat` and `../config/env`.

- [ ] **Step 3: Add env config**

Create `src/config/env.ts`:

```ts
const DEFAULT_API_BASE_URL = "http://localhost:8001";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

export const API_BASE_URL = trimTrailingSlashes(
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
);
```

- [ ] **Step 4: Add generic SSE request layer**

Create `src/request/stream.ts`:

```ts
import { API_BASE_URL } from "../config/env";

export interface PostSseStreamOptions<TEvent> {
  path: string;
  body: unknown;
  onEvent: (event: TEvent) => void;
  onDone: () => void;
  onError: (err: string) => void;
}

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function postSseStream<TEvent>({
  path,
  body,
  onEvent,
  onDone,
  onError,
}: PostSseStreamOptions<TEvent>): AbortController {
  const controller = new AbortController();

  fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") {
              onDone();
              return;
            }
            try {
              onEvent(JSON.parse(data) as TEvent);
            } catch {
              // Preserve existing behavior: ignore malformed chunks.
            }
          }
        }
      }
      onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        onError(err.message);
      }
    });

  return controller;
}
```

- [ ] **Step 5: Add chat API layer**

Create `src/api/chat.ts`:

```ts
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
```

- [ ] **Step 6: Run typecheck to verify it passes**

Run:

```bash
/Users/caisufang/.nvm/versions/node/v20.20.0/bin/node node_modules/typescript/bin/tsc -b
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/api/chat.contract.ts src/config/env.ts src/request/stream.ts src/api/chat.ts
git commit -m "refactor: add chat api request layers"
```

---

### Task 2: Rewire App And Environment Example

**Files:**
- Modify: `src/App.tsx`
- Create: `.env.example`
- Delete: `src/sse.ts`

**Interfaces:**
- Consumes: `streamChat(options: StreamChatOptions): AbortController` from `src/api/chat.ts`.
- Consumes: `API_BASE_URL: string` from `src/config/env.ts`.
- Produces: UI that no longer imports `src/sse.ts`.

- [ ] **Step 1: Update App imports**

Change the first imports in `src/App.tsx` to:

```ts
import { useState, useRef, useEffect } from "react";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import { API_BASE_URL } from "./config/env";
```

- [ ] **Step 2: Update `streamChat` call**

Replace the old positional call with:

```ts
streamChat({
  message: text,
  sessionId,
  onEvent: (event: ChatStreamEvent) => {
    if (event.type === "tool_start") {
      steps.push({ id: Date.now(), type: "tool_start", tool: event.tool, content: event.input });
      setToolStatus(`🔧 调用 ${event.tool}...`);
      setReplies((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "agent") {
          last.steps = [...steps];
        }
        return updated;
      });
    } else if (event.type === "tool_end") {
      steps.push({ id: Date.now(), type: "tool_end", tool: event.tool, content: event.output });
      setToolStatus("");
      setReplies((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "agent") {
          last.steps = [...steps];
        }
        return updated;
      });
    } else if (event.type === "text") {
      agentContent += event.content;
      setReplies((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "agent") {
          return [...updated.slice(0, -1), { ...last, content: agentContent, steps: [...steps] }];
        }
        return [...updated, { role: "agent", content: agentContent, steps: [...steps] }];
      });
    }
  },
  onDone: () => {
    setLoading(false);
    setToolStatus("");
  },
  onError: (err) => {
    setLoading(false);
    setToolStatus("");
    setReplies((prev) => [
      ...prev,
      { role: "agent", content: `❌ 出错了：${err}`, steps: [] },
    ]);
  },
});
```

- [ ] **Step 3: Update backend display**

Change the footer text to:

```tsx
后端: {API_BASE_URL} | 会话: {sessionId.slice(-8)}
```

- [ ] **Step 4: Add env example**

Create `.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:8001
```

- [ ] **Step 5: Delete old SSE module**

Delete `src/sse.ts`.

- [ ] **Step 6: Run verification**

Run:

```bash
/Users/caisufang/.nvm/versions/node/v20.20.0/bin/node node_modules/typescript/bin/tsc -b
/Users/caisufang/.nvm/versions/node/v20.20.0/bin/node node_modules/oxlint/bin/oxlint
/Users/caisufang/.nvm/versions/node/v20.20.0/bin/node node_modules/vite/bin/vite.js build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

Run:

```bash
git add .env.example src/App.tsx src/sse.ts
git commit -m "refactor: move chat stream into api layer"
```
