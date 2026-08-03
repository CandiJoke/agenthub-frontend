# Agent Work Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mixed, observable Agent work timeline so users see meaningful progress while the backend streams tool activity and final answer text.

**Architecture:** The backend emits a richer SSE event contract from `/chat/stream`, including stage, tool, text, error, and completion transport events. The frontend keeps the transport layer thin, converts stream events into a stable in-progress agent message model, and renders a compact timeline with expandable tool details beside the streaming answer.

**Tech Stack:** Python 3 + FastAPI + LangChain/LangGraph streaming on the backend; React 19 + TypeScript + Vite + Oxlint on the frontend; native Server-Sent Event parsing through `fetch` streams.

## Global Constraints

- Do not expose hidden model chain-of-thought; display only system-observable events and user-facing status messages.
- Keep `/chat/stream` as Server-Sent Events where each payload is sent as `data: <json>\n\n`.
- Keep the existing `[DONE]` sentinel as the transport-level completion marker.
- Keep final answer text streaming through `{ "type": "text", "content": string }`.
- Add these stream event variants: `stage`, `tool_start`, `tool_end`, `text`, `error`.
- Stage values are exactly: `received`, `planning`, `tooling`, `answering`, `completed`.
- The frontend disables input during one active request in the first version.
- Tool details are compact by default and expandable per timeline item.
- Backend tool input and output are truncated before streaming to protect the UI.
- Do not commit `agent_hub.db`, `agent_hub.db-shm`, `agent_hub.db-wal`, `__pycache__`, or generated build artifacts.

---

## File Structure

Backend repository: `/Users/caisufang/projects/agent-hub`

- Modify `api_server.py`: owns the FastAPI app, the global LangChain agent, SSE serialization helpers, and the `/chat/stream` generator.
- Create `test_api_stream_events.py`: covers backend SSE payload helpers and stream lifecycle behavior with a fake async agent.

Frontend repository: `/Users/caisufang/projects/agent-hub-frontend`

- Modify `src/api/chat.ts`: owns the chat stream event TypeScript contract and `/chat/stream` request wrapper.
- Modify `src/api/chat.contract.ts`: compile-time contract sample for all stream event variants and timeline reducer usage.
- Create `src/chat/workTimeline.ts`: pure frontend state helpers that convert backend stream events into timeline items and an agent chat message.
- Modify `src/App.tsx`: owns React state, stream lifecycle callbacks, and rendering.
- Modify `src/App.css`: replaces stale template styles with the chat/timeline layout.

---

### Task 1: Backend SSE Event Helpers

**Files:**
- Modify: `/Users/caisufang/projects/agent-hub/api_server.py`
- Create: `/Users/caisufang/projects/agent-hub/test_api_stream_events.py`

**Interfaces:**
- Consumes: existing `json` import in `api_server.py`.
- Produces:
  - `STREAM_INPUT_LIMIT: int`
  - `STREAM_OUTPUT_LIMIT: int`
  - `truncate_stream_value(value: object, limit: int) -> str`
  - `make_stage_event(stage: str, message: str) -> dict[str, object]`
  - `make_tool_start_event(tool: str, input_value: object) -> dict[str, object]`
  - `make_tool_end_event(tool: str, output_value: object, elapsed_ms: int | None = None) -> dict[str, object]`
  - `make_text_event(content: str) -> dict[str, object]`
  - `make_error_event(message: str) -> dict[str, object]`
  - `stream_event(payload: dict[str, object]) -> str`
  - `done_event() -> str`

- [ ] **Step 1: Write the failing tests**

Create `/Users/caisufang/projects/agent-hub/test_api_stream_events.py` with:

```python
import json
import os
import unittest

os.environ.setdefault("OPENAI_API_KEY", "sk-test")

import api_server


def parse_sse_payload(chunk: str) -> dict:
    assert chunk.startswith("data: ")
    assert chunk.endswith("\n\n")
    return json.loads(chunk.removeprefix("data: ").strip())


class StreamEventHelperTests(unittest.TestCase):
    def test_stage_event_serializes_as_sse_json(self):
        chunk = api_server.stream_event(
            api_server.make_stage_event("received", "已收到问题")
        )

        self.assertEqual(
            parse_sse_payload(chunk),
            {
                "type": "stage",
                "stage": "received",
                "message": "已收到问题",
            },
        )

    def test_tool_events_truncate_display_payloads(self):
        input_payload = {"expression": "1+" * 300}
        output_payload = "结果" * 400

        start_event = api_server.make_tool_start_event("calculator", input_payload)
        end_event = api_server.make_tool_end_event(
            "calculator",
            output_payload,
            elapsed_ms=42,
        )

        self.assertEqual(start_event["type"], "tool_start")
        self.assertEqual(start_event["tool"], "calculator")
        self.assertLessEqual(len(start_event["input"]), api_server.STREAM_INPUT_LIMIT)
        self.assertEqual(end_event["type"], "tool_end")
        self.assertEqual(end_event["tool"], "calculator")
        self.assertEqual(end_event["elapsed_ms"], 42)
        self.assertLessEqual(len(end_event["output"]), api_server.STREAM_OUTPUT_LIMIT)

    def test_text_error_and_done_events_have_expected_shapes(self):
        self.assertEqual(
            api_server.make_text_event("hello"),
            {"type": "text", "content": "hello"},
        )
        self.assertEqual(
            api_server.make_error_event("boom"),
            {"type": "error", "message": "boom"},
        )
        self.assertEqual(api_server.done_event(), "data: [DONE]\n\n")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest test_api_stream_events.StreamEventHelperTests -v
```

Expected: FAIL with an `AttributeError` mentioning `stream_event` or `make_stage_event`.

- [ ] **Step 3: Add the minimal helper implementation**

In `/Users/caisufang/projects/agent-hub/api_server.py`, add these constants and helper functions after the global `agent = create_langchain_agent(...)` line:

```python
STREAM_INPUT_LIMIT = 200
STREAM_OUTPUT_LIMIT = 500


def truncate_stream_value(value: object, limit: int) -> str:
    text = str(value)
    return text if len(text) <= limit else text[:limit]


def make_stage_event(stage: str, message: str) -> dict[str, object]:
    return {
        "type": "stage",
        "stage": stage,
        "message": message,
    }


def make_tool_start_event(tool: str, input_value: object) -> dict[str, object]:
    return {
        "type": "tool_start",
        "tool": tool,
        "input": truncate_stream_value(input_value, STREAM_INPUT_LIMIT),
    }


def make_tool_end_event(
    tool: str,
    output_value: object,
    elapsed_ms: int | None = None,
) -> dict[str, object]:
    payload: dict[str, object] = {
        "type": "tool_end",
        "tool": tool,
        "output": truncate_stream_value(output_value, STREAM_OUTPUT_LIMIT),
    }
    if elapsed_ms is not None:
        payload["elapsed_ms"] = elapsed_ms
    return payload


def make_text_event(content: str) -> dict[str, object]:
    return {
        "type": "text",
        "content": content,
    }


def make_error_event(message: str) -> dict[str, object]:
    return {
        "type": "error",
        "message": message,
    }


def stream_event(payload: dict[str, object]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def done_event() -> str:
    return "data: [DONE]\n\n"
```

- [ ] **Step 4: Run the focused backend tests**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest test_api_stream_events.StreamEventHelperTests -v
```

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit backend helper changes**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
git status --short
git add api_server.py test_api_stream_events.py
git commit -m "feat: add stream event helpers"
```

Expected: commit includes only `api_server.py` and `test_api_stream_events.py`. Leave `agent_hub.db*` untracked.

---

### Task 2: Backend Stream Lifecycle Events

**Files:**
- Modify: `/Users/caisufang/projects/agent-hub/api_server.py`
- Modify: `/Users/caisufang/projects/agent-hub/test_api_stream_events.py`

**Interfaces:**
- Consumes:
  - `ChatRequest(message: str, session_id: str = "default")`
  - `stream_event(payload: dict[str, object]) -> str`
  - `done_event() -> str`
  - helper payload builders from Task 1.
- Produces:
  - `async def stream_chat_events(req: ChatRequest, stream_agent=None) -> AsyncIterator[str]`
  - `/chat/stream` returns `StreamingResponse(stream_chat_events(req), media_type="text/event-stream", headers={...})`

- [ ] **Step 1: Add failing stream lifecycle tests**

Append this code to `/Users/caisufang/projects/agent-hub/test_api_stream_events.py` before the `if __name__ == "__main__":` block:

```python
class FakeChunk:
    def __init__(self, content: str):
        self.content = content


class FakeStreamAgent:
    def __init__(self, events, error: Exception | None = None):
        self.events = events
        self.error = error
        self.payload = None
        self.config = None
        self.version = None

    async def astream_events(self, payload, config=None, version=None):
        self.payload = payload
        self.config = config
        self.version = version
        for event in self.events:
            yield event
        if self.error is not None:
            raise self.error


async def collect_stream(req: api_server.ChatRequest, fake_agent: FakeStreamAgent):
    chunks = []
    async for chunk in api_server.stream_chat_events(req, stream_agent=fake_agent):
        chunks.append(chunk)
    return chunks


def json_chunks(chunks: list[str]) -> list[dict]:
    return [
        parse_sse_payload(chunk)
        for chunk in chunks
        if chunk != api_server.done_event()
    ]


class StreamChatEventsTests(unittest.IsolatedAsyncioTestCase):
    async def test_stream_chat_events_emits_stages_tools_text_and_done(self):
        fake_agent = FakeStreamAgent(
            [
                {
                    "event": "on_tool_start",
                    "name": "calculator",
                    "data": {"input": {"expression": "2+3"}},
                },
                {
                    "event": "on_tool_end",
                    "name": "calculator",
                    "data": {"output": "2+3 = 5"},
                },
                {
                    "event": "on_chat_model_stream",
                    "data": {"chunk": FakeChunk("答案")},
                },
            ]
        )
        req = api_server.ChatRequest(message="帮我算 2+3", session_id="session-test")

        chunks = await collect_stream(req, fake_agent)
        payloads = json_chunks(chunks)

        self.assertEqual(chunks[-1], api_server.done_event())
        self.assertEqual(
            [payload["type"] for payload in payloads],
            [
                "stage",
                "stage",
                "stage",
                "tool_start",
                "tool_end",
                "stage",
                "text",
                "stage",
            ],
        )
        self.assertEqual(payloads[0]["stage"], "received")
        self.assertEqual(payloads[1]["stage"], "planning")
        self.assertEqual(payloads[2]["stage"], "tooling")
        self.assertEqual(payloads[3]["tool"], "calculator")
        self.assertEqual(payloads[4]["tool"], "calculator")
        self.assertIn("elapsed_ms", payloads[4])
        self.assertEqual(payloads[5]["stage"], "answering")
        self.assertEqual(payloads[6]["content"], "答案")
        self.assertEqual(payloads[7]["stage"], "completed")
        self.assertEqual(
            fake_agent.config,
            {"configurable": {"thread_id": "session-test"}},
        )
        self.assertEqual(fake_agent.version, "v2")

    async def test_stream_chat_events_emits_error_event_before_done(self):
        fake_agent = FakeStreamAgent([], error=RuntimeError("model exploded"))
        req = api_server.ChatRequest(message="hello", session_id="session-error")

        chunks = await collect_stream(req, fake_agent)
        payloads = json_chunks(chunks)

        self.assertEqual(chunks[-1], api_server.done_event())
        self.assertEqual(payloads[-1], {"type": "error", "message": "model exploded"})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest test_api_stream_events -v
```

Expected: FAIL with an `AttributeError` mentioning `stream_chat_events`.

- [ ] **Step 3: Implement `stream_chat_events` and wire `/chat/stream` to it**

In `/Users/caisufang/projects/agent-hub/api_server.py`, add this import near the existing imports:

```python
import time
```

Replace the current `/chat/stream` implementation with:

```python
async def stream_chat_events(req: ChatRequest, stream_agent=None) -> AsyncIterator[str]:
    active_agent = stream_agent or agent
    config = {"configurable": {"thread_id": req.session_id}}
    tool_started_at: dict[str, float] = {}
    answer_started = False

    yield stream_event(make_stage_event("received", "已收到问题"))
    yield stream_event(make_stage_event("planning", "正在判断是否需要工具"))

    try:
        async for event in active_agent.astream_events(
            {"messages": [("user", req.message)]},
            config=config,
            version="v2",
        ):
            kind = event.get("event", "")

            if kind == "on_tool_start":
                tool_name = event["name"]
                tool_started_at[tool_name] = time.perf_counter()
                yield stream_event(make_stage_event("tooling", f"正在调用 {tool_name}"))
                yield stream_event(
                    make_tool_start_event(
                        tool_name,
                        event["data"].get("input", ""),
                    )
                )

            elif kind == "on_tool_end":
                tool_name = event["name"]
                started_at = tool_started_at.pop(tool_name, None)
                elapsed_ms = None
                if started_at is not None:
                    elapsed_ms = round((time.perf_counter() - started_at) * 1000)
                yield stream_event(
                    make_tool_end_event(
                        tool_name,
                        event["data"].get("output", ""),
                        elapsed_ms=elapsed_ms,
                    )
                )

            elif kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                content = getattr(chunk, "content", "")
                if content:
                    if not answer_started:
                        answer_started = True
                        yield stream_event(make_stage_event("answering", "正在整理最终回答"))
                    yield stream_event(make_text_event(content))

        yield stream_event(make_stage_event("completed", "已完成"))
    except Exception as exc:
        yield stream_event(make_error_event(str(exc)))
    finally:
        yield done_event()


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    """SSE 流式：实时推送可观察工作过程和回答"""
    return StreamingResponse(
        stream_chat_events(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
```

- [ ] **Step 4: Run backend stream tests**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest test_api_stream_events -v
```

Expected: PASS with 5 tests.

- [ ] **Step 5: Run full backend verification**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest discover -v
.venv/bin/python -m py_compile agent_console.py api_server.py examples/python_basics.py test_agent_console.py test_api_stream_events.py test_tools.py
```

Expected: unittest reports all tests OK, and `py_compile` exits with code 0.

- [ ] **Step 6: Commit backend stream lifecycle changes**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
git status --short
git add api_server.py test_api_stream_events.py
git commit -m "feat: stream agent work events"
```

Expected: commit includes only `api_server.py` and `test_api_stream_events.py`. Leave `agent_hub.db*` untracked.

---

### Task 3: Frontend Stream Contract and Timeline State

**Files:**
- Modify: `/Users/caisufang/projects/agent-hub-frontend/src/api/chat.ts`
- Modify: `/Users/caisufang/projects/agent-hub-frontend/src/api/chat.contract.ts`
- Create: `/Users/caisufang/projects/agent-hub-frontend/src/chat/workTimeline.ts`

**Interfaces:**
- Consumes:
  - `streamChat(options: StreamChatOptions): AbortController`
  - backend `ChatStreamEvent` variants from the spec.
- Produces:
  - `ChatStreamEvent` union with `stage`, `tool_start`, `tool_end`, `text`, `error`.
  - `createUserMessage(id: string, content: string): UserChatMessage`
  - `createPendingAgentMessage(id: string): AgentChatMessage`
  - `appendChatStreamEvent(message: AgentChatMessage, event: ChatStreamEvent): AgentChatMessage`
  - `finishAgentMessage(message: AgentChatMessage): AgentChatMessage`

- [ ] **Step 1: Write failing TypeScript contract usage**

Replace `/Users/caisufang/projects/agent-hub-frontend/src/api/chat.contract.ts` with:

```ts
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
```

- [ ] **Step 2: Run frontend build to verify it fails**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run build
```

Expected: FAIL with TypeScript errors saying `../chat/workTimeline` cannot be found and the `stage` / `error` event variants are not assignable.

- [ ] **Step 3: Extend `ChatStreamEvent`**

Replace the `ChatStreamEvent` type in `/Users/caisufang/projects/agent-hub-frontend/src/api/chat.ts` with:

```ts
export type ChatStage =
  | "received"
  | "planning"
  | "tooling"
  | "answering"
  | "completed";

export type ChatStreamEvent =
  | { type: "stage"; stage: ChatStage; message: string }
  | { type: "tool_start"; tool: string; input: string }
  | { type: "tool_end"; tool: string; output: string; elapsed_ms?: number }
  | { type: "text"; content: string }
  | { type: "error"; message: string };
```

Leave `StreamChatOptions` and `streamChat(...)` unchanged.

- [ ] **Step 4: Create timeline state helpers**

Create `/Users/caisufang/projects/agent-hub-frontend/src/chat/workTimeline.ts` with:

```ts
import type { ChatStage, ChatStreamEvent } from "../api/chat";

export type TimelineStatus = "running" | "completed" | "failed";

export type TimelineItem =
  | {
      id: string;
      kind: "stage";
      stage: ChatStage;
      message: string;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "tool";
      tool: string;
      input: string;
      output?: string;
      elapsedMs?: number;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "answer";
      message: string;
      status: TimelineStatus;
    }
  | {
      id: string;
      kind: "error";
      message: string;
      status: "failed";
    };

export interface UserChatMessage {
  id: string;
  role: "user";
  content: string;
}

export interface AgentChatMessage {
  id: string;
  role: "agent";
  content: string;
  timeline: TimelineItem[];
  currentStatus: string;
  loading: boolean;
  error?: string;
}

export type ChatMessage = UserChatMessage | AgentChatMessage;

export function createUserMessage(id: string, content: string): UserChatMessage {
  return {
    id,
    role: "user",
    content,
  };
}

export function createPendingAgentMessage(id: string): AgentChatMessage {
  return {
    id,
    role: "agent",
    content: "",
    timeline: [],
    currentStatus: "准备连接 Agent",
    loading: true,
  };
}

export function appendChatStreamEvent(
  message: AgentChatMessage,
  event: ChatStreamEvent,
): AgentChatMessage {
  if (event.type === "stage") {
    return appendStageEvent(message, event.stage, event.message);
  }

  if (event.type === "tool_start") {
    const timeline = completeRunningItems(message.timeline);
    return {
      ...message,
      timeline: [
        ...timeline,
        {
          id: nextTimelineId("tool", timeline),
          kind: "tool",
          tool: event.tool,
          input: event.input,
          status: "running",
        },
      ],
      currentStatus: `正在调用 ${event.tool}`,
    };
  }

  if (event.type === "tool_end") {
    const timeline = completeLatestTool(
      message.timeline,
      event.tool,
      event.output,
      event.elapsed_ms,
    );
    return {
      ...message,
      timeline,
      currentStatus: `${event.tool} 已返回结果`,
    };
  }

  if (event.type === "text") {
    const timeline = ensureAnswerItem(message.timeline);
    return {
      ...message,
      content: `${message.content}${event.content}`,
      timeline,
      currentStatus: "正在生成回答",
    };
  }

  return {
    ...message,
    timeline: [
      ...completeRunningItems(message.timeline, "failed"),
      {
        id: nextTimelineId("error", message.timeline),
        kind: "error",
        message: event.message,
        status: "failed",
      },
    ],
    currentStatus: "请求失败",
    loading: false,
    error: event.message,
  };
}

export function finishAgentMessage(message: AgentChatMessage): AgentChatMessage {
  if (message.error) {
    return {
      ...message,
      loading: false,
    };
  }

  return {
    ...message,
    timeline: completeRunningItems(message.timeline),
    currentStatus: "完成",
    loading: false,
  };
}

function appendStageEvent(
  message: AgentChatMessage,
  stage: ChatStage,
  stageMessage: string,
): AgentChatMessage {
  const status: TimelineStatus = stage === "completed" ? "completed" : "running";
  const timeline = completeRunningItems(message.timeline);
  return {
    ...message,
    timeline: [
      ...timeline,
      {
        id: nextTimelineId("stage", timeline),
        kind: "stage",
        stage,
        message: stageMessage,
        status,
      },
    ],
    currentStatus: stageMessage,
    loading: stage !== "completed",
  };
}

function completeRunningItems(
  timeline: TimelineItem[],
  status: TimelineStatus = "completed",
): TimelineItem[] {
  return timeline.map((item) => {
    if (item.status !== "running") return item;
    return { ...item, status };
  });
}

function completeLatestTool(
  timeline: TimelineItem[],
  tool: string,
  output: string,
  elapsedMs?: number,
): TimelineItem[] {
  let matched = false;
  const updated = [...timeline].reverse().map((item) => {
    if (!matched && item.kind === "tool" && item.tool === tool && item.status === "running") {
      matched = true;
      return {
        ...item,
        output,
        elapsedMs,
        status: "completed" as const,
      };
    }
    return item;
  }).reverse();

  if (matched) return updated;

  return [
    ...completeRunningItems(timeline),
    {
      id: nextTimelineId("tool", timeline),
      kind: "tool",
      tool,
      input: "",
      output,
      elapsedMs,
      status: "completed",
    },
  ];
}

function ensureAnswerItem(timeline: TimelineItem[]): TimelineItem[] {
  if (timeline.some((item) => item.kind === "answer")) {
    return timeline;
  }

  const completed = completeRunningItems(timeline);
  return [
    ...completed,
    {
      id: nextTimelineId("answer", completed),
      kind: "answer",
      message: "最终回答开始输出",
      status: "running",
    },
  ];
}

function nextTimelineId(prefix: string, timeline: TimelineItem[]): string {
  return `${prefix}-${timeline.length + 1}`;
}
```

- [ ] **Step 5: Run frontend type/build verification**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run build
```

Expected: PASS with TypeScript build and Vite build completing successfully.

- [ ] **Step 6: Commit frontend contract changes**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
git status --short
git add src/api/chat.ts src/api/chat.contract.ts src/chat/workTimeline.ts
git commit -m "feat: model agent work timeline state"
```

Expected: commit includes only the three listed files.

---

### Task 4: Frontend Timeline Rendering

**Files:**
- Modify: `/Users/caisufang/projects/agent-hub-frontend/src/App.tsx`

**Interfaces:**
- Consumes:
  - `streamChat(options: StreamChatOptions): AbortController`
  - `ChatStreamEvent`
  - `ChatMessage`, `AgentChatMessage`, `TimelineItem`
  - `createUserMessage(...)`
  - `createPendingAgentMessage(...)`
  - `appendChatStreamEvent(...)`
  - `finishAgentMessage(...)`
- Produces:
  - A React UI that shows user messages, streaming agent answers, current status, and expandable timeline details.

- [ ] **Step 1: Replace `App.tsx` with timeline-aware rendering**

Replace `/Users/caisufang/projects/agent-hub-frontend/src/App.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import "./App.css";
import { streamChat, type ChatStreamEvent } from "./api/chat";
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  createUserMessage,
  finishAgentMessage,
  type AgentChatMessage,
  type ChatMessage,
  type TimelineItem,
} from "./chat/workTimeline";
import { API_BASE_URL } from "./config/env";

function updateAgentMessage(
  messages: ChatMessage[],
  agentId: string,
  updater: (message: AgentChatMessage) => AgentChatMessage,
): ChatMessage[] {
  return messages.map((message) => {
    if (message.role === "agent" && message.id === agentId) {
      return updater(message);
    }
    return message;
  });
}

function statusLabel(status: TimelineItem["status"]): string {
  if (status === "running") return "进行中";
  if (status === "failed") return "失败";
  return "完成";
}

function timelineTitle(item: TimelineItem): string {
  if (item.kind === "stage") return item.message;
  if (item.kind === "tool") {
    if (item.status === "running") return `调用 ${item.tool}`;
    const elapsed = item.elapsedMs === undefined ? "" : ` · ${item.elapsedMs} ms`;
    return `${item.tool} 已返回${elapsed}`;
  }
  if (item.kind === "answer") return item.message;
  return item.message;
}

function TimelineDetails({ item }: { item: TimelineItem }) {
  if (item.kind !== "tool") return null;

  return (
    <details className="timeline-details">
      <summary>查看工具输入和输出</summary>
      <div className="tool-detail-block">
        <span>Input</span>
        <pre>{item.input || "无输入内容"}</pre>
      </div>
      <div className="tool-detail-block">
        <span>Output</span>
        <pre>{item.output || "等待工具返回"}</pre>
      </div>
    </details>
  );
}

function Timeline({ message }: { message: AgentChatMessage }) {
  if (message.timeline.length === 0) {
    return (
      <div className="timeline-empty">
        <span className="pulse-dot" />
        {message.currentStatus}
      </div>
    );
  }

  return (
    <ol className="timeline">
      {message.timeline.map((item) => (
        <li className={`timeline-item timeline-item-${item.status}`} key={item.id}>
          <div className="timeline-marker" />
          <div className="timeline-body">
            <div className="timeline-row">
              <span className="timeline-title">{timelineTitle(item)}</span>
              <span className="timeline-status">{statusLabel(item.status)}</span>
            </div>
            <TimelineDetails item={item} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = useRef(`session_${Date.now()}`).current;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const handleStreamEvent = (agentId: string, event: ChatStreamEvent) => {
    setMessages((currentMessages) =>
      updateAgentMessage(currentMessages, agentId, (agentMessage) =>
        appendChatStreamEvent(agentMessage, event),
      ),
    );

    if (event.type === "error") {
      setLoading(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text || loading) return;

    const createdAt = Date.now();
    const userMessage = createUserMessage(`user-${createdAt}`, text);
    const agentId = `agent-${createdAt}`;
    const agentMessage = createPendingAgentMessage(agentId);

    setInput("");
    setLoading(true);
    setMessages((currentMessages) => [...currentMessages, userMessage, agentMessage]);

    streamChat({
      message: text,
      sessionId,
      onEvent: (event) => handleStreamEvent(agentId, event),
      onDone: () => {
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, finishAgentMessage),
        );
      },
      onError: (errorMessage) => {
        setLoading(false);
        setMessages((currentMessages) =>
          updateAgentMessage(currentMessages, agentId, (agent) =>
            appendChatStreamEvent(agent, {
              type: "error",
              message: errorMessage,
            }),
          ),
        );
      },
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <main className="app-shell">
      <section className="chat-surface" aria-label="Agent Hub chat">
        <header className="app-header">
          <div>
            <h1>Agent Hub</h1>
            <p>实时查看 Agent 的可观察工作过程</p>
          </div>
          <div className="session-pill" title={sessionId}>
            {sessionId.slice(-8)}
          </div>
        </header>

        <div className="messages-panel">
          {messages.length === 0 && (
            <div className="empty-state">
              <strong>输入一个问题开始</strong>
              <span>例如：帮我算 123*456，或者问什么是 LangChain。</span>
            </div>
          )}

          {messages.map((message) => (
            <article className={`message message-${message.role}`} key={message.id}>
              {message.role === "user" ? (
                <div className="message-bubble user-bubble">{message.content}</div>
              ) : (
                <div className="agent-response">
                  <Timeline message={message} />
                  <div className="agent-status">
                    <span className={message.loading ? "pulse-dot" : "steady-dot"} />
                    {message.currentStatus}
                  </div>
                  <div className="message-bubble agent-bubble">
                    {message.content || (message.error ? `出错了：${message.error}` : "等待输出...")}
                  </div>
                </div>
              )}
            </article>
          ))}
          <div ref={bottomRef} />
        </div>

        <footer className="composer">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="输入问题"
            disabled={loading}
            rows={2}
          />
          <button onClick={handleSend} disabled={loading || !input.trim()}>
            {loading ? "运行中" : "发送"}
          </button>
        </footer>

        <div className="backend-line">后端：{API_BASE_URL}</div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run frontend build to catch TypeScript errors**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run build
```

Expected: PASS with TypeScript build and Vite build completing successfully.

- [ ] **Step 3: Commit frontend rendering changes**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
git status --short
git add src/App.tsx
git commit -m "feat: render agent work timeline"
```

Expected: commit includes only `src/App.tsx`.

---

### Task 5: Frontend Timeline Styling

**Files:**
- Modify: `/Users/caisufang/projects/agent-hub-frontend/src/App.css`
- Optionally inspect: `/Users/caisufang/projects/agent-hub-frontend/src/index.css`

**Interfaces:**
- Consumes: class names introduced by Task 4.
- Produces: responsive chat layout with stable timeline dimensions, clear status markers, and expandable tool details.

- [ ] **Step 1: Replace stale template CSS with app styles**

Replace `/Users/caisufang/projects/agent-hub-frontend/src/App.css` with:

```css
.app-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%);
  color: #172033;
}

.chat-surface {
  width: min(980px, 100%);
  min-height: calc(100vh - 48px);
  margin: 0 auto;
  display: grid;
  grid-template-rows: auto 1fr auto auto;
  border: 1px solid #d9e1ec;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 18px 50px rgba(28, 42, 68, 0.12);
  overflow: hidden;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 22px;
  border-bottom: 1px solid #e5ebf3;
  background: #fbfcfe;
}

.app-header h1 {
  margin: 0;
  font-size: 22px;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0;
}

.app-header p {
  margin: 4px 0 0;
  color: #607089;
  font-size: 13px;
  line-height: 1.4;
}

.session-pill {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid #cdd8e6;
  border-radius: 999px;
  color: #44546f;
  background: #f5f8fc;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.messages-panel {
  min-height: 0;
  padding: 20px 22px;
  overflow-y: auto;
  background: #f7f9fc;
}

.empty-state {
  min-height: 360px;
  display: grid;
  place-content: center;
  gap: 8px;
  color: #607089;
  text-align: center;
}

.empty-state strong {
  color: #263348;
  font-size: 17px;
}

.empty-state span {
  font-size: 14px;
}

.message {
  display: flex;
  margin-bottom: 18px;
}

.message-user {
  justify-content: flex-end;
}

.message-agent {
  justify-content: flex-start;
}

.message-bubble {
  max-width: min(720px, 86%);
  border-radius: 8px;
  padding: 11px 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.65;
  font-size: 14px;
}

.user-bubble {
  color: #ffffff;
  background: #2563eb;
}

.agent-response {
  width: min(760px, 100%);
  display: grid;
  gap: 10px;
}

.agent-bubble {
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #e1e7f0;
}

.timeline-empty,
.agent-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #53647d;
  font-size: 13px;
}

.timeline {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.timeline-item {
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
}

.timeline-marker {
  width: 10px;
  height: 10px;
  margin-top: 9px;
  border-radius: 999px;
  background: #94a3b8;
  box-shadow: 0 0 0 4px #e8eef6;
}

.timeline-item-running .timeline-marker {
  background: #2563eb;
  box-shadow: 0 0 0 4px #dbeafe;
}

.timeline-item-completed .timeline-marker {
  background: #0f9f6e;
  box-shadow: 0 0 0 4px #dff7ed;
}

.timeline-item-failed .timeline-marker {
  background: #dc2626;
  box-shadow: 0 0 0 4px #fee2e2;
}

.timeline-body {
  min-width: 0;
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
}

.timeline-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.timeline-title {
  min-width: 0;
  color: #263348;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.timeline-status {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 999px;
  background: #eef2f7;
  color: #526179;
  font-size: 11px;
}

.timeline-item-running .timeline-status {
  background: #dbeafe;
  color: #1d4ed8;
}

.timeline-item-completed .timeline-status {
  background: #dff7ed;
  color: #047857;
}

.timeline-item-failed .timeline-status {
  background: #fee2e2;
  color: #b91c1c;
}

.timeline-details {
  margin-top: 8px;
}

.timeline-details summary {
  cursor: pointer;
  color: #2563eb;
  font-size: 12px;
}

.tool-detail-block {
  margin-top: 8px;
  display: grid;
  gap: 4px;
}

.tool-detail-block span {
  color: #6b7890;
  font-size: 11px;
  text-transform: uppercase;
}

.tool-detail-block pre {
  max-height: 160px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  background: #0f172a;
  color: #e5eefb;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.pulse-dot,
.steady-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
}

.pulse-dot {
  background: #2563eb;
  animation: pulse 1.2s ease-in-out infinite;
}

.steady-dot {
  background: #0f9f6e;
}

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  padding: 14px 22px;
  border-top: 1px solid #e5ebf3;
  background: #ffffff;
}

.composer textarea {
  width: 100%;
  min-height: 44px;
  max-height: 140px;
  resize: vertical;
  border: 1px solid #ccd7e5;
  border-radius: 8px;
  padding: 10px 12px;
  color: #1f2937;
  background: #ffffff;
  font: inherit;
  line-height: 1.45;
  outline: none;
}

.composer textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.composer textarea:disabled {
  color: #79869a;
  background: #f1f5f9;
}

.composer button {
  min-width: 86px;
  height: 44px;
  align-self: end;
  border: 0;
  border-radius: 8px;
  color: #ffffff;
  background: #2563eb;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.composer button:disabled {
  cursor: not-allowed;
  background: #93a4ba;
}

.backend-line {
  padding: 0 22px 14px;
  color: #8a97aa;
  background: #ffffff;
  font-size: 12px;
}

@keyframes pulse {
  0% {
    opacity: 0.45;
    transform: scale(0.9);
  }
  50% {
    opacity: 1;
    transform: scale(1.18);
  }
  100% {
    opacity: 0.45;
    transform: scale(0.9);
  }
}

@media (max-width: 720px) {
  .app-shell {
    padding: 0;
  }

  .chat-surface {
    min-height: 100vh;
    border: 0;
    border-radius: 0;
  }

  .app-header,
  .messages-panel,
  .composer {
    padding-inline: 14px;
  }

  .composer {
    grid-template-columns: 1fr;
  }

  .composer button {
    width: 100%;
  }

  .message-bubble {
    max-width: 94%;
  }
}
```

- [ ] **Step 2: Run lint and build**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run lint
npm run build
```

Expected: Oxlint exits with 0 errors, and Vite production build completes successfully.

- [ ] **Step 3: Commit frontend styling changes**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
git status --short
git add src/App.css
git commit -m "style: polish agent timeline"
```

Expected: commit includes only `src/App.css`.

---

### Task 6: End-to-End Verification

**Files:**
- Inspect: `/Users/caisufang/projects/agent-hub/api_server.py`
- Inspect: `/Users/caisufang/projects/agent-hub-frontend/src/App.tsx`
- Inspect: `/Users/caisufang/projects/agent-hub-frontend/src/chat/workTimeline.ts`

**Interfaces:**
- Consumes: completed backend and frontend work from Tasks 1-5.
- Produces: verified local behavior and a short manual test note.

- [ ] **Step 1: Run backend verification**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python -m unittest discover -v
.venv/bin/python -m py_compile agent_console.py api_server.py examples/python_basics.py test_agent_console.py test_api_stream_events.py test_tools.py
```

Expected: unittest reports all tests OK, and `py_compile` exits with code 0.

- [ ] **Step 2: Run frontend verification**

Run:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run lint
npm run build
```

Expected: Oxlint exits with 0 errors, and Vite production build completes successfully.

- [ ] **Step 3: Start backend locally**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
.venv/bin/python api_server.py
```

Expected: Uvicorn starts on `http://0.0.0.0:8001`.

- [ ] **Step 4: Start frontend locally**

Run in a second terminal:

```bash
cd /Users/caisufang/projects/agent-hub-frontend
npm run dev
```

Expected: Vite prints a local URL, usually `http://localhost:5173/`.

- [ ] **Step 5: Manually verify calculator stream**

Open the frontend URL and send:

```text
帮我算 123*456
```

Expected visible behavior:

- Timeline first shows `已收到问题`.
- Timeline then shows `正在判断是否需要工具`.
- Timeline shows a running calculator tool item.
- Calculator item becomes completed and shows elapsed milliseconds.
- Expanding the calculator item shows input and output.
- Final answer text streams into the answer bubble.
- Current status ends as `完成`.

- [ ] **Step 6: Manually verify knowledge stream**

Send:

```text
什么是 LangChain？
```

Expected visible behavior:

- Timeline advances through received and planning stages.
- If the model calls `search_knowledge`, the timeline shows tool start and tool end.
- If the model answers without a tool, the timeline still shows answering and completed stages.
- Final answer remains readable and does not overlap timeline content.

- [ ] **Step 7: Manually verify backend error rendering**

Temporarily run the frontend against an unavailable backend by changing the browser environment to point at a stopped backend, or stop the backend and send a new message.

Expected visible behavior:

- The agent message remains visible.
- A timeline error item appears.
- The answer bubble shows `出错了：<message>`.
- Input becomes enabled after the failure.

- [ ] **Step 8: Final repository status check**

Run:

```bash
cd /Users/caisufang/projects/agent-hub
git status --short
cd /Users/caisufang/projects/agent-hub-frontend
git status --short
```

Expected:

- Backend may still show untracked `agent_hub.db*` files; do not commit them.
- Frontend should be clean after the plan and implementation commits.
- No generated `dist`, `node_modules`, or cache files are staged.
