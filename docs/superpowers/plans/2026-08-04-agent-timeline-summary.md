# Agent Timeline Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw event-log timeline with a compact user-facing Agent progress summary while preserving expandable execution details.

**Architecture:** Keep `AgentChatMessage.timeline` as the raw event source. Add a derived summary model in `src/chat/workTimeline.ts`, then render that model from `src/App.tsx` so the default UI is concise and details remain available through disclosure controls.

**Tech Stack:** React 19, TypeScript 6, Vite 8, oxlint, Node 20.20.0 through nvm.

## Global Constraints

- Keep the existing backend stream contract as the source of truth.
- Do not change the backend event protocol.
- Do not show hidden model reasoning or chain-of-thought.
- Summary mode is the default user experience.
- Tool calls should appear as one compact summary per tool run, not separate start and end nodes.
- Completed answers leave the execution trace collapsed by default.
- Errors preserve partial answer content and show failure state.
- Do not add frontend dependencies.

---

## File Structure

- Modify `src/chat/workTimeline.ts`: add summary presentation types and `summarizeAgentMessage(message)`.
- Modify `contracts/workTimeline.contract.ts`: add runtime contracts for summary grouping, completion collapse, and error expansion.
- Modify `src/App.tsx`: render the summary model instead of the raw timeline as the primary UI; keep raw details inside disclosure UI.
- Modify `src/App.css`: replace raw timeline-heavy styling with compact progress, summary item, and execution-details styles.

---

### Task 1: Summary Presentation Model

**Files:**
- Modify: `src/chat/workTimeline.ts`
- Test: `contracts/workTimeline.contract.ts`

**Interfaces:**
- Consumes: `AgentChatMessage`, `TimelineItem`, `TimelineStatus`.
- Produces:
  - `type TimelinePhase = "received" | "thinking" | "tooling" | "answering" | "completed" | "failed"`
  - `interface TimelineSummaryItem`
  - `interface TimelineSummary`
  - `function summarizeAgentMessage(message: AgentChatMessage): TimelineSummary`

- [ ] **Step 1: Add failing summary contracts**

Append these assertions to `contracts/workTimeline.contract.ts` after the existing legacy fallback assertion and before `console.log`:

```ts
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
    { label: "Understanding request", status: "completed" },
    { label: "calculator returned a result · 42 ms", status: "completed" },
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
assert.equal(summary.currentLabel, "Result received. Writing the answer.");
assert.equal(
  summary.primaryItems.some((item) => item.label === "Writing answer"),
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
assert.equal(summary.currentLabel, "Answer complete.");
assert.equal(summary.shouldCollapseDetails, true);
assert.equal(summary.detailLabel, "View execution details · 4 stages · 1 tool · 42 ms");

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
assert.equal(failedSummary.currentLabel, "Request failed.");
assert.equal(failedSummary.shouldExpandDetails, true);
assert.equal(failedSummary.shouldCollapseDetails, false);
```

Also update the import:

```ts
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  finishAgentMessage,
  summarizeAgentMessage,
} from "../src/chat/workTimeline.js";
```

- [ ] **Step 2: Run contract test to verify it fails**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: TypeScript fails because `summarizeAgentMessage` is not exported.

- [ ] **Step 3: Add summary model implementation**

Add these exports near the existing timeline types in `src/chat/workTimeline.ts`:

```ts
export type TimelinePhase =
  | "received"
  | "thinking"
  | "tooling"
  | "answering"
  | "completed"
  | "failed";

export interface TimelineSummaryItem {
  id: string;
  label: string;
  status: TimelineStatus;
}

export interface TimelineSummary {
  currentLabel: string;
  phase: TimelinePhase;
  toolCount: number;
  stageCount: number;
  elapsedMs?: number;
  primaryItems: TimelineSummaryItem[];
  detailItems: TimelineItem[];
  detailLabel: string;
  shouldCollapseDetails: boolean;
  shouldExpandDetails: boolean;
}
```

Add this exported function below `finishAgentMessage`:

```ts
export function summarizeAgentMessage(message: AgentChatMessage): TimelineSummary {
  const tools = message.timeline.filter((item) => item.kind === "tool");
  const stages = message.timeline.filter((item) => item.kind === "stage");
  const elapsedMs = tools.reduce<number | undefined>((total, item) => {
    if (item.elapsedMs === undefined) return total;
    return (total ?? 0) + item.elapsedMs;
  }, undefined);
  const phase = resolveSummaryPhase(message);
  const primaryItems = buildSummaryItems(message.timeline, phase);
  const shouldExpandDetails = phase === "failed";
  const shouldCollapseDetails = phase === "completed";

  return {
    currentLabel: resolveSummaryLabel(message, phase),
    phase,
    toolCount: tools.length,
    stageCount: stages.length,
    elapsedMs,
    primaryItems,
    detailItems: message.timeline,
    detailLabel: buildDetailLabel(stages.length, tools.length, elapsedMs),
    shouldCollapseDetails,
    shouldExpandDetails,
  };
}
```

Add helper functions below the existing private helpers:

```ts
function resolveSummaryPhase(message: AgentChatMessage): TimelinePhase {
  if (message.error) return "failed";
  if (!message.loading) return "completed";
  if (message.timeline.some((item) => item.kind === "answer")) return "answering";
  if (message.timeline.some((item) => item.kind === "tool")) return "tooling";

  const latestStage = [...message.timeline]
    .reverse()
    .find((item) => item.kind === "stage");
  if (!latestStage || latestStage.kind !== "stage") return "received";
  if (latestStage.stage === "received") return "received";
  return "thinking";
}

function resolveSummaryLabel(
  message: AgentChatMessage,
  phase: TimelinePhase,
): string {
  if (phase === "failed") return "Request failed.";
  if (phase === "completed") return "Answer complete.";
  if (phase === "answering") return "Result received. Writing the answer.";

  const runningTool = [...message.timeline]
    .reverse()
    .find((item) => item.kind === "tool" && item.status === "running");
  if (runningTool && runningTool.kind === "tool") return `Using ${runningTool.tool}.`;

  if (phase === "tooling") return "Tool result received.";
  if (phase === "thinking") return "Checking what needs to be done.";
  return "Received your question.";
}

function buildSummaryItems(
  timeline: TimelineItem[],
  phase: TimelinePhase,
): TimelineSummaryItem[] {
  const items: TimelineSummaryItem[] = [];
  if (timeline.some((item) => item.kind === "stage")) {
    items.push({
      id: "summary-understanding",
      label: "Understanding request",
      status: phase === "failed" ? "failed" : "completed",
    });
  }

  for (const item of timeline) {
    if (item.kind !== "tool") continue;
    items.push({
      id: `summary-${item.id}`,
      label: summarizeToolItem(item),
      status: item.status,
    });
  }

  if (timeline.some((item) => item.kind === "answer")) {
    items.push({
      id: "summary-answer",
      label: "Writing answer",
      status: phase === "answering" ? "running" : "completed",
    });
  }

  return items;
}

function summarizeToolItem(item: Extract<TimelineItem, { kind: "tool" }>): string {
  if (item.status === "running") return `Using ${item.tool}`;
  if (item.status === "failed") return `${item.tool} failed`;
  const elapsed = item.elapsedMs === undefined ? "" : ` · ${item.elapsedMs} ms`;
  return `${item.tool} returned a result${elapsed}`;
}

function buildDetailLabel(
  stageCount: number,
  toolCount: number,
  elapsedMs?: number,
): string {
  const elapsed = elapsedMs === undefined ? "" : ` · ${elapsed} ms`;
  return `View execution details · ${stageCount} stages · ${toolCount} tool${toolCount === 1 ? "" : "s"}${elapsed}`;
}
```

- [ ] **Step 4: Run contract test to verify it passes**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: `workTimeline contracts passed` and `stream contracts passed`.

- [ ] **Step 5: Commit**

```bash
git add src/chat/workTimeline.ts contracts/workTimeline.contract.ts
git commit -m "feat: summarize agent timeline state"
```

---

### Task 2: Compact Timeline Rendering

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `summarizeAgentMessage(message: AgentChatMessage): TimelineSummary`, `TimelineSummaryItem`, and existing `TimelineItem`.
- Produces: compact progress UI with raw execution details inside disclosure controls.

- [ ] **Step 1: Update imports**

Add `summarizeAgentMessage` and `TimelineSummaryItem` to the existing import from `./chat/workTimeline`:

```ts
import {
  appendChatStreamEvent,
  createPendingAgentMessage,
  createUserMessage,
  finishAgentMessage,
  summarizeAgentMessage,
  type AgentChatMessage,
  type ChatMessage,
  type TimelineItem,
  type TimelineSummaryItem,
} from "./chat/workTimeline";
```

- [ ] **Step 2: Replace raw primary timeline with summary components**

Replace the existing `Timeline` function with these components:

```tsx
function SummaryStatus({ item }: { item: TimelineSummaryItem }) {
  return (
    <li className={`summary-item summary-item-${item.status}`}>
      <span className="summary-marker" />
      <span className="summary-label">{item.label}</span>
      <span className="summary-status">{statusLabel(item.status)}</span>
    </li>
  );
}

function ExecutionDetails({ item }: { item: TimelineItem }) {
  return (
    <li className={`detail-item detail-item-${item.status}`}>
      <div className="detail-row">
        <span>{timelineTitle(item)}</span>
        <span>{statusLabel(item.status)}</span>
      </div>
      <TimelineDetails item={item} />
    </li>
  );
}

function Timeline({ message }: { message: AgentChatMessage }) {
  const summary = summarizeAgentMessage(message);
  const detailOpen = summary.shouldExpandDetails && !summary.shouldCollapseDetails;

  if (summary.primaryItems.length === 0) {
    return (
      <div className="work-summary-empty">
        <span className="pulse-dot" />
        {summary.currentLabel}
      </div>
    );
  }

  return (
    <section className={`work-summary work-summary-${summary.phase}`}>
      <div className="work-current">
        <span
          className={
            summary.phase === "failed"
              ? "error-dot"
              : summary.phase === "completed"
                ? "steady-dot"
                : "pulse-dot"
          }
        />
        <span>{summary.currentLabel}</span>
      </div>
      {!summary.shouldCollapseDetails && (
        <ol className="summary-list">
          {summary.primaryItems.map((item) => (
            <SummaryStatus item={item} key={item.id} />
          ))}
        </ol>
      )}
      <details className="execution-details" open={detailOpen}>
        <summary>{summary.detailLabel}</summary>
        <ol className="detail-list">
          {summary.detailItems.map((item) => (
            <ExecutionDetails item={item} key={item.id} />
          ))}
        </ol>
      </details>
    </section>
  );
}
```

- [ ] **Step 3: Remove duplicate status noise from answer body**

In the agent response JSX, remove the separate `<div className="agent-status">...</div>` block because `Timeline` now owns the current status sentence.

- [ ] **Step 4: Run build**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render compact agent progress"
```

---

### Task 3: Summary Styling And Verification

**Files:**
- Modify: `src/App.css`
- Test: package scripts

**Interfaces:**
- Consumes: class names introduced by Task 2.
- Produces: compact progress styling, folded execution details, responsive behavior.

- [ ] **Step 1: Replace timeline-heavy CSS with compact summary CSS**

Replace the existing `.timeline*`, `.tool-detail-block`, and `.agent-status` related rules with:

```css
.work-summary,
.work-summary-empty {
  display: grid;
  gap: 8px;
  max-width: min(720px, 94%);
}

.work-current,
.work-summary-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #53647d;
  font-size: 13px;
}

.summary-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.summary-item {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 6px 9px;
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  background: #ffffff;
}

.summary-marker {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #94a3b8;
}

.summary-item-running .summary-marker {
  background: #2563eb;
}

.summary-item-completed .summary-marker {
  background: #0f9f6e;
}

.summary-item-failed .summary-marker {
  background: #dc2626;
}

.summary-label {
  min-width: 0;
  color: #263348;
  font-size: 13px;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.summary-status {
  flex: 0 0 auto;
  color: #66758d;
  font-size: 11px;
}

.execution-details {
  color: #53647d;
  font-size: 12px;
}

.execution-details summary {
  cursor: pointer;
  color: #2563eb;
}

.detail-list {
  display: grid;
  gap: 7px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.detail-item {
  border: 1px solid #e1e7f0;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: #263348;
  font-size: 13px;
  line-height: 1.4;
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
```

- [ ] **Step 2: Run lint**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run lint
```

Expected: oxlint passes with no errors.

- [ ] **Step 3: Run build**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Run contracts**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: `workTimeline contracts passed` and `stream contracts passed`.

- [ ] **Step 5: Commit**

```bash
git add src/App.css
git commit -m "style: compact agent progress timeline"
```

---

## Final Verification

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run lint
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected:

- Lint passes.
- Build passes.
- Contract tests pass.

If a browser connector is available, also verify:

- Desktop viewport shows compact progress during a calculator request.
- Mobile viewport does not overflow with long tool output.
- Completed answer shows collapsed execution details.
- Error state expands execution details.
