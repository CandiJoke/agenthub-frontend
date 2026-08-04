# Markdown Answer Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Agent answers as safe, readable Markdown while preserving plain-text user messages and the existing backend stream contract.

**Architecture:** Add a focused Markdown rendering unit under `src/chat/`, backed by `react-markdown` and `remark-gfm`. Keep streaming normalization as a separately tested pure helper, then wire the renderer into the Agent answer bubble and scope all Markdown styles under `.markdown-message`.

**Tech Stack:** React 19, TypeScript 6, Vite 8, oxlint, Node 20.20.0 through nvm, `react-markdown`, `remark-gfm`.

## Global Constraints

- Render Markdown only for Agent answer content.
- Keep user messages as plain text.
- Keep the backend stream contract unchanged.
- Support streaming updates without waiting for the full answer.
- Support common GitHub-flavored Markdown features.
- Add safe rendering defaults that do not allow raw HTML execution.
- Do not use `dangerouslySetInnerHTML`.
- Do not enable raw HTML rendering.
- Links should be rendered with `target="_blank"` and `rel="noreferrer"`.
- No backend API changes are required.

---

## File Structure

- Create `src/chat/markdown.ts`: pure Markdown helpers for streaming-safe display.
- Create `src/chat/MarkdownMessage.tsx`: React Markdown renderer for Agent answers.
- Create `contracts/markdown.contract.tsx`: runtime contracts for helper behavior and rendered Markdown output.
- Modify `tsconfig.contract.json`: allow TSX contract files.
- Modify `package.json` and `package-lock.json`: add `react-markdown` and `remark-gfm`, and run the new contract.
- Modify `src/App.tsx`: render Agent content through `MarkdownMessage`.
- Modify `src/App.css`: add scoped Markdown styles and keep user bubbles as plain pre-wrapped text.

---

### Task 1: Markdown Renderer Core

**Files:**
- Create: `src/chat/markdown.ts`
- Create: `src/chat/MarkdownMessage.tsx`
- Create: `contracts/markdown.contract.tsx`
- Modify: `tsconfig.contract.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `content: string` from Agent answer state.
- Produces:
  - `function normalizeStreamingMarkdown(content: string): string`
  - `interface MarkdownMessageProps { content: string }`
  - `function MarkdownMessage({ content }: MarkdownMessageProps): JSX.Element`

- [ ] **Step 1: Install Markdown dependencies**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm install react-markdown remark-gfm
```

Expected: `package.json` and `package-lock.json` are updated with `react-markdown` and `remark-gfm`.

- [ ] **Step 2: Add TSX contract support**

Modify `tsconfig.contract.json` to include JSX support and TSX contract files:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node", "vite/client"],
    "strict": true,
    "skipLibCheck": true,
    "rootDir": ".",
    "outDir": "node_modules/.tmp/contracts",
    "noEmitOnError": true,
    "jsx": "react-jsx"
  },
  "include": ["contracts/**/*.ts", "contracts/**/*.tsx"]
}
```

- [ ] **Step 3: Update contract script**

Modify `package.json` so `test:contracts` also runs the Markdown contract:

```json
"test:contracts": "tsc -p tsconfig.contract.json && node node_modules/.tmp/contracts/contracts/workTimeline.contract.js && node node_modules/.tmp/contracts/contracts/stream.contract.js && node node_modules/.tmp/contracts/contracts/markdown.contract.js"
```

- [ ] **Step 4: Write failing Markdown contract**

Create `contracts/markdown.contract.tsx`:

```tsx
import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownMessage } from "../src/chat/MarkdownMessage.js";
import { normalizeStreamingMarkdown } from "../src/chat/markdown.js";
import { createUserMessage } from "../src/chat/workTimeline.js";

assert.equal(normalizeStreamingMarkdown("plain text"), "plain text");

const balancedFence = "```ts\nconst answer = 42;\n```";
assert.equal(normalizeStreamingMarkdown(balancedFence), balancedFence);

const openFence = "```ts\nconst answer = 42;";
assert.equal(normalizeStreamingMarkdown(openFence), openFence + "\n```");

const reopenedFence = "before\n```ts\ncode\n```\nafter\n```json\n{";
assert.equal(normalizeStreamingMarkdown(reopenedFence), reopenedFence + "\n```");

const richHtml = renderToStaticMarkup(
  <MarkdownMessage content={"# 标题\n\n- 第一项\n- 第二项\n\n`inline`"} />,
);
assert.match(richHtml, /<h1>标题<\/h1>/);
assert.match(richHtml, /<ul>/);
assert.match(richHtml, /<code>inline<\/code>/);

const tableHtml = renderToStaticMarkup(
  <MarkdownMessage content={"| A | B |\n| - | - |\n| 1 | 2 |"} />,
);
assert.match(tableHtml, /markdown-table-wrap/);
assert.match(tableHtml, /<table>/);

const linkHtml = renderToStaticMarkup(
  <MarkdownMessage content={"[OpenAI](https://openai.com)"} />,
);
assert.match(linkHtml, /target="_blank"/);
assert.match(linkHtml, /rel="noreferrer"/);

const unsafeHtml = renderToStaticMarkup(
  <MarkdownMessage content={"<script>alert(1)</script>**safe**"} />,
);
assert.doesNotMatch(unsafeHtml, /script/);
assert.match(unsafeHtml, /<strong>safe<\/strong>/);

const userMessage = createUserMessage("user-md", "**not rendered**");
assert.equal(userMessage.content, "**not rendered**");

console.log("markdown contracts passed");
```

- [ ] **Step 5: Run contract test to verify it fails**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: TypeScript fails because `src/chat/MarkdownMessage.tsx` and `src/chat/markdown.ts` do not exist.

- [ ] **Step 6: Implement streaming Markdown helper**

Create `src/chat/markdown.ts`:

```ts
const FENCED_CODE_MARKER = /```/g;

export function normalizeStreamingMarkdown(content: string): string {
  const fenceCount = content.match(FENCED_CODE_MARKER)?.length ?? 0;
  if (fenceCount % 2 === 0) return content;
  return content + "\n```";
}
```

- [ ] **Step 7: Implement Markdown renderer component**

Create `src/chat/MarkdownMessage.tsx`:

```tsx
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { normalizeStreamingMarkdown } from "./markdown";

export interface MarkdownMessageProps {
  content: string;
}

const markdownComponents: Components = {
  a({ node: _node, ...props }) {
    return <a {...props} target="_blank" rel="noreferrer" />;
  },
  table({ node: _node, ...props }) {
    return (
      <div className="markdown-table-wrap">
        <table {...props} />
      </div>
    );
  },
};

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-message">
      <Markdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {normalizeStreamingMarkdown(content)}
      </Markdown>
    </div>
  );
}
```

- [ ] **Step 8: Run contract test to verify it passes**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: `workTimeline contracts passed`, `stream contracts passed`, and `markdown contracts passed`.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.contract.json contracts/markdown.contract.tsx src/chat/markdown.ts src/chat/MarkdownMessage.tsx
git commit -m "feat: add markdown answer renderer"
```

---

### Task 2: Agent Bubble Integration

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `MarkdownMessage` from `./chat/MarkdownMessage`.
- Produces: Agent messages render Markdown; user messages remain unchanged.

- [ ] **Step 1: Import MarkdownMessage**

Add this import to `src/App.tsx`:

```tsx
import { MarkdownMessage } from "./chat/MarkdownMessage";
```

- [ ] **Step 2: Render Agent content through MarkdownMessage**

Replace the current Agent bubble content:

```tsx
{message.content || (message.error ? "未能生成回答。" : "等待输出...")}
```

with:

```tsx
{message.content ? (
  <MarkdownMessage content={message.content} />
) : (
  message.error ? "未能生成回答。" : "等待输出..."
)}
```

Do not change the user bubble rendering.

- [ ] **Step 3: Run build**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: render agent markdown answers"
```

---

### Task 3: Markdown Styling And Verification

**Files:**
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `.markdown-message` and `.markdown-table-wrap` from `MarkdownMessage`.
- Produces: scoped Markdown styling that does not affect user bubbles or other UI.

- [ ] **Step 1: Preserve plain-text user bubbles**

In `src/App.css`, remove `white-space: pre-wrap;` from `.message-bubble` and add it to `.user-bubble`:

```css
.message-bubble {
  max-width: min(720px, 86%);
  border-radius: 8px;
  padding: 11px 14px;
  overflow-wrap: anywhere;
  line-height: 1.65;
  font-size: 14px;
}

.user-bubble {
  color: #ffffff;
  background: #2563eb;
  white-space: pre-wrap;
}
```

- [ ] **Step 2: Add scoped Markdown styles**

Add these styles after `.agent-bubble`:

```css
.markdown-message {
  display: block;
  color: #1f2937;
}

.markdown-message :where(h1, h2, h3, h4, h5, h6) {
  margin: 0 0 8px;
  color: #172033;
  line-height: 1.3;
  font-weight: 700;
  letter-spacing: 0;
}

.markdown-message h1 {
  font-size: 20px;
}

.markdown-message h2 {
  font-size: 18px;
}

.markdown-message h3 {
  font-size: 16px;
}

.markdown-message :where(h4, h5, h6) {
  font-size: 14px;
}

.markdown-message :where(p, ul, ol, blockquote, pre, .markdown-table-wrap) {
  margin: 0 0 10px;
}

.markdown-message :where(p, ul, ol, blockquote, pre, .markdown-table-wrap):last-child {
  margin-bottom: 0;
}

.markdown-message :where(ul, ol) {
  padding-left: 22px;
}

.markdown-message li + li {
  margin-top: 4px;
}

.markdown-message blockquote {
  border-left: 3px solid #cbd5e1;
  padding-left: 10px;
  color: #526179;
}

.markdown-message a {
  color: #1d4ed8;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.markdown-message :not(pre) > code {
  border-radius: 5px;
  padding: 2px 5px;
  background: #eef2f7;
  color: #172033;
  font-size: 0.92em;
}

.markdown-message pre {
  max-width: 100%;
  overflow-x: auto;
  border-radius: 8px;
  padding: 12px;
  background: #111827;
  color: #e5eefb;
  font-size: 13px;
  line-height: 1.55;
}

.markdown-message pre code {
  padding: 0;
  background: transparent;
  color: inherit;
  white-space: pre;
}

.markdown-table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

.markdown-table-wrap table {
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.markdown-table-wrap th,
.markdown-table-wrap td {
  border: 1px solid #d9e1ec;
  padding: 7px 9px;
  text-align: left;
  vertical-align: top;
}

.markdown-table-wrap th {
  background: #f1f5f9;
  color: #263348;
  font-weight: 650;
}

.markdown-message input[type="checkbox"] {
  margin-right: 6px;
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run lint
```

Expected: oxlint passes with no errors.

- [ ] **Step 4: Run build**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 5: Run contracts**

Run:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Expected: `workTimeline contracts passed`, `stream contracts passed`, and `markdown contracts passed`.

- [ ] **Step 6: Commit**

```bash
git add src/App.css
git commit -m "style: format markdown answers"
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

Manual verification:

- Ask for a Markdown answer with headings and lists.
- Ask for a fenced code example.
- Ask for a Markdown table.
- Confirm user messages still render as plain text.
- Confirm mobile width does not overflow for code blocks or tables.
