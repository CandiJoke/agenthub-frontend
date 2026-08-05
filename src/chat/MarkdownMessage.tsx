import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { normalizeStreamingMarkdown } from "./markdown.js";

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
