# Markdown Answer Rendering Design

## Goal

Make Agent answers easier to read when the model returns Markdown. The frontend should render common Markdown structures in the assistant response bubble while keeping user input, stream handling, and backend contracts unchanged.

The experience should make long answers scannable: headings should create structure, lists should be readable, code blocks should be distinct, and tables should not break the chat layout.

## Scope

- Render Markdown only for Agent answer content.
- Keep user messages as plain text.
- Keep the backend stream contract unchanged.
- Support streaming updates without waiting for the full answer.
- Support common GitHub-flavored Markdown features.
- Add safe rendering defaults that do not allow raw HTML execution.
- Style Markdown inside the existing chat bubble system.

Out of scope:

- Backend Markdown preprocessing.
- Rich document export.
- Mermaid diagrams.
- Math rendering.
- Full syntax highlighting in the first version.
- Editing rendered Markdown.

## Recommended Approach

Use `react-markdown` for Markdown rendering and `remark-gfm` for GitHub-flavored Markdown support.

This gives practical support for:

- Headings.
- Paragraphs.
- Bold and italic text.
- Links.
- Ordered and unordered lists.
- Inline code.
- Fenced code blocks.
- Blockquotes.
- Tables.
- Task lists.

Do not use `dangerouslySetInnerHTML`. Do not enable raw HTML rendering. If the model emits HTML, it should be treated as text or ignored by the Markdown renderer according to the library's safe defaults.

## Component Design

Add a focused component:

```ts
interface MarkdownMessageProps {
  content: string;
}
```

Recommended file:

```text
src/chat/MarkdownMessage.tsx
```

Responsibilities:

- Accept the Agent answer string.
- Prepare the content for stable streaming display.
- Render Markdown through `react-markdown`.
- Customize core elements with class names or component overrides where needed.

The main `App.tsx` should stay thin:

```tsx
<div className="message-bubble agent-bubble">
  {message.content ? (
    <MarkdownMessage content={message.content} />
  ) : (
    message.error ? "未能生成回答。" : "等待输出..."
  )}
</div>
```

## Streaming Behavior

The Agent response arrives token by token. The renderer should work with partial Markdown.

For the first version:

- Render content on every stream update.
- Preserve partial paragraphs and partial lists.
- If the content contains an unmatched fenced code block marker, append a temporary closing fence only for rendering.
- Do not mutate the stored message content.

Example helper behavior:

```ts
export function normalizeStreamingMarkdown(content: string): string {
  const fenceCount = (content.match(/```/g) ?? []).length;
  return fenceCount % 2 === 1 ? content + "\n```" : content;
}
```

The exact implementation can choose a clearer helper name, but the behavior should be covered by a contract test.

## Styling

Markdown styling should be scoped under a parent class such as `.markdown-message` so it does not leak into the rest of the app.

Required styling:

- Paragraphs use comfortable vertical spacing but do not create excessive gaps in chat bubbles.
- Headings are smaller than page headings and fit the message bubble.
- Lists have visible indentation and consistent spacing.
- Inline code uses a subtle pill-like background.
- Fenced code blocks use a distinct dark surface, fixed padding, and horizontal overflow.
- Tables are wrapped or styled so they can scroll horizontally on small screens.
- Blockquotes use a left border and subdued text.
- Links are visibly interactive and safe to open.

The existing `.message-bubble` should no longer rely on `white-space: pre-wrap` for Agent Markdown rendering. User bubbles can keep plain text behavior.

## Links

Links should be rendered with:

```tsx
target="_blank"
rel="noreferrer"
```

The displayed Markdown should not execute scripts or render raw HTML. External links are acceptable as normal clickable anchors.

## Error Handling

If Markdown rendering receives an empty string, the caller should keep showing the existing fallback text.

If Markdown content is malformed, the renderer should still show the best-effort text. It should not crash the chat view. The streaming fence normalization exists specifically to avoid broken code block presentation during partial output.

## Testing

Add contract coverage for Markdown helpers:

- Plain text returns unchanged.
- Balanced fenced code blocks return unchanged.
- Unmatched fenced code blocks get a temporary closing fence.
- User message creation remains plain text and does not use Markdown rendering.

Run existing frontend checks:

```bash
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run lint
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run build
source ~/.nvm/nvm.sh && nvm use 20.20.0 && npm run test:contracts
```

Manual verification:

- Ask for a Markdown answer with headings and lists.
- Ask for a code example with a fenced code block.
- Ask for a table.
- Confirm user messages still render as plain text.
- Confirm mobile width does not overflow for code blocks or tables.

## Acceptance Criteria

- Agent answers render Markdown instead of plain pre-wrapped text.
- User messages remain plain text.
- Code blocks and tables are readable and do not break layout.
- Streaming partial Markdown does not crash or produce a visibly broken answer bubble.
- Raw HTML is not enabled.
- No backend API changes are required.
