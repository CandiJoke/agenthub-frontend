const FENCED_CODE_MARKER = /```/g;

export function normalizeStreamingMarkdown(content: string): string {
  const fenceCount = content.match(FENCED_CODE_MARKER)?.length ?? 0;
  if (fenceCount % 2 === 0) return content;
  return content + "\n```";
}
