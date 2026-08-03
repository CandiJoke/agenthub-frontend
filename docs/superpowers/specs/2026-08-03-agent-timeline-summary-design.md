# Agent Timeline Summary Design

## Goal

Reduce visual noise in the Agent work timeline without losing observability. The backend should continue emitting detailed stream events, while the frontend presents those events as a compact, user-readable progress summary by default.

The waiting experience should feel active and understandable: users should see what kind of work is happening now, what has already happened, and where to open details when they care.

## Scope

- Keep the existing backend stream contract as the source of truth.
- Add a frontend presentation layer that groups low-level events into fewer semantic progress items.
- Show one clear current activity line during streaming.
- Collapse technical tool input/output behind details.
- Preserve a developer-oriented detailed view for debugging.
- Automatically simplify the timeline after the answer completes.

Out of scope:

- Changing the backend event protocol.
- Showing hidden model reasoning or chain-of-thought.
- Multi-agent orchestration views.
- Persistent trace history outside the current chat session.

## Experience Model

The frontend should stop rendering every stream event as a primary timeline node. Instead, it should render three layers:

1. Current activity sentence.
2. Compact user-facing progress summary.
3. Expandable technical details.

During a request, the main visible surface should look closer to:

```text
Working with tools
calculator returned a result · 42 ms
```

After completion, the process should collapse to:

```text
View execution details · 4 stages · 1 tool · 2.3 s
```

The final answer remains the main content. The timeline supports trust and anticipation while the user waits, but should not compete with the answer after completion.

## Presentation Modes

### Summary Mode

Summary mode is the default user experience.

It should show only major progress groups:

- Received question.
- Understanding request.
- Using tools.
- Writing answer.
- Completed.

Tool calls should appear as one compact summary per tool run, not separate start and end nodes.

### Details Mode

Details mode is available through disclosure UI such as "View execution details".

It should show:

- Tool name.
- Tool status.
- Elapsed time when available.
- Truncated input.
- Truncated output.
- Error message when applicable.

### Debug Mode

Debug mode is optional UI for development. If added, it should show the closest representation of raw stream events, including run IDs where available.

This mode is not the default and should not be visually prominent for normal users.

## Frontend Data Flow

The existing reducer can continue storing the full `timeline` array. A new derived presentation model should transform it into compact UI sections.

Recommended derived model:

```ts
interface TimelineSummary {
  currentLabel: string;
  phase: "received" | "thinking" | "tooling" | "answering" | "completed" | "failed";
  toolCount: number;
  elapsedMs?: number;
  primaryItems: TimelineSummaryItem[];
  detailItems: TimelineItem[];
}
```

The raw timeline remains useful for tests and debugging. The React view should render the derived summary by default.

## UI Behavior

- While loading, show a current activity sentence above the answer bubble.
- While a tool is running, show one compact activity row for that tool.
- When a tool completes, update the same row with the result status and elapsed time.
- When text starts streaming, keep the answer bubble visually dominant.
- After completion, collapse the process area to one details disclosure.
- On error, keep the relevant process area expanded enough to explain where the failure happened.

Good status copy examples:

- "Received your question."
- "Checking what needs to be done."
- "Using calculator."
- "Result received. Writing the answer."
- "Answer complete."

## Error Handling

Errors should stay readable and useful:

- Preserve partial answer content.
- Show a visible error banner.
- Mark the summary phase as failed.
- Expand details automatically when a tool error or stream error exists.
- Do not expose raw backend exception text unless the backend already sends a safe public message.

## Testing

Frontend tests should cover:

- Multiple raw stage events collapse into a small number of summary items.
- A tool start and matching tool end render as one summary item.
- Duplicate tool names with different run IDs remain distinct in details.
- Completion collapses the process area by default.
- Error events keep partial answer content and show failure state.

Manual verification should cover:

- Calculator request.
- Non-tool knowledge request.
- Backend connection failure.
- Mobile viewport with long tool output.

## Acceptance Criteria

- Default UI no longer looks like a raw event log.
- The user can tell what the Agent is doing while waiting.
- Tool details are still available on demand.
- Completed answers leave the execution trace collapsed by default.
- Existing stream parsing and backend behavior continue working unchanged.
