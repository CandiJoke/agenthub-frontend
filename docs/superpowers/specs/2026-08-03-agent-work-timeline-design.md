# Agent Work Timeline Design

## Goal

Make the frontend show the backend Agent's observable work process while a user waits for an answer. The experience should feel continuous, detailed, and anticipatory: users should see that the Agent is receiving the request, deciding whether tools are needed, running tools, processing results, and streaming the final answer.

This feature must not expose hidden model chain-of-thought. It should display only system-observable events and human-readable status messages derived from those events.

## Scope

- Extend the backend streaming protocol with higher-level stage events.
- Keep existing token streaming for final answer text.
- Add timing and structured error events where practical.
- Render frontend events as a readable Agent work timeline.
- Keep raw tool details available through expandable UI sections.
- Show a current status line so the user always has a sense of motion.

Out of scope for the first version:

- Multi-agent orchestration.
- True internal reasoning trace.
- Persistent trace history outside the current chat session.
- Complex replay/debug dashboards.

## Experience Model

The frontend should use a mixed presentation:

- Real backend events provide the source of truth.
- UI copy translates those events into clear user-facing progress.
- Technical details are available, but not forced into the main reading path.

Example timeline:

```text
Received the question
Checking whether a tool is needed
Calling calculator
calculator returned: 56088
Preparing the final answer
Final answer streaming
Completed
```

## Stream Event Contract

The backend `/chat/stream` endpoint should emit Server-Sent Events where each `data:` payload is one JSON object.

Recommended TypeScript contract:

```ts
type ChatStreamEvent =
  | {
      type: "stage";
      stage: "received" | "planning" | "tooling" | "answering" | "completed";
      message: string;
    }
  | {
      type: "tool_start";
      tool: string;
      input: string;
    }
  | {
      type: "tool_end";
      tool: string;
      output: string;
      elapsed_ms?: number;
    }
  | {
      type: "text";
      content: string;
    }
  | {
      type: "error";
      message: string;
    };
```

The existing `[DONE]` sentinel remains the transport-level completion marker.

## Backend Behavior

The backend should emit `stage` events at predictable points:

- `received`: immediately after the stream starts.
- `planning`: before invoking the LangGraph agent stream.
- `tooling`: when a tool starts.
- `answering`: when the first answer text token is observed.
- `completed`: after the agent stream finishes successfully.

Tool events should continue to be emitted from LangGraph stream events:

- `on_tool_start` becomes `tool_start`.
- `on_tool_end` becomes `tool_end`.
- `on_chat_model_stream` with content becomes `text`.

When a tool finishes, the backend should include `elapsed_ms` if it can measure the matching start time. Tool input and output should be truncated to reasonable display lengths to protect the UI from oversized payloads.

If an exception occurs during streaming, the backend should emit an `error` event before ending the stream.

## Frontend Behavior

The frontend should maintain one in-progress agent response object while the stream is active. That object contains:

- Final answer content.
- Timeline items.
- Current status text.
- Loading state.
- Optional error state.

Timeline item types:

- Stage item: user-friendly status milestone.
- Tool item: starts as running, then becomes completed or failed.
- Answer item: marks when answer streaming begins.
- Error item: visible failure state.

Tool items should show a compact summary by default:

```text
calculator completed in 42 ms
```

They should support expanding details:

```text
Input: {"expression":"123*456"}
Output: 56088
```

The final answer should continue streaming in the main chat bubble. The timeline should not compete with the answer; it should help users understand what is happening while they wait.

## Interaction Details

- Auto-scroll should continue following new output unless the user has intentionally scrolled away.
- The input should remain disabled during one active request in the first version.
- The current status line should update on every meaningful event.
- Tool details should be expandable per item.
- Errors should appear both in the timeline and in the chat answer area.

## Error Handling

Frontend request errors should produce a visible timeline error item and a readable agent message.

Backend stream errors should use:

```json
{"type":"error","message":"..."}
```

After an error, the frontend should stop the loading state and leave the partial timeline visible for diagnosis.

Malformed SSE JSON chunks can continue to be ignored by the request layer for compatibility, but backend-emitted `error` events must be rendered.

## Testing

Backend verification:

- Unit tests for emitted event payload shapes where practical.
- Existing Python unittest suite.
- Python compile check.

Frontend verification:

- TypeScript build.
- Oxlint.
- Vite production build.
- Manual local stream test with a calculator request and a knowledge-search request.

The manual test should confirm:

- Stage events appear before final text.
- Tool start and end appear in order.
- Tool elapsed time appears when available.
- Final answer streams into the main answer area.
- Error events render visibly.

