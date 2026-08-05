import assert from "node:assert/strict";

import { renderToStaticMarkup } from "react-dom/server";

import { MarkdownMessage } from "../src/chat/MarkdownMessage.js";
import { ThinkingMessage } from "../src/chat/ThinkingMessage.js";
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
  <MarkdownMessage content={"**safe**\n\n<script>alert(1)</script>"} />,
);
assert.doesNotMatch(unsafeHtml, /script/);
assert.match(unsafeHtml, /<strong>safe<\/strong>/);

const userMessage = createUserMessage("user-md", "**not rendered**");
assert.equal(userMessage.content, "**not rendered**");

const thinkingHtml = renderToStaticMarkup(<ThinkingMessage />);
assert.match(thinkingHtml, /正在思考/);
assert.match(thinkingHtml, /thinking-message/);
assert.equal((thinkingHtml.match(/class="thinking-dot"/g) ?? []).length, 3);

const customThinkingHtml = renderToStaticMarkup(
  <ThinkingMessage label="正在组织回答" />,
);
assert.match(customThinkingHtml, /正在组织回答/);

console.log("markdown contracts passed");
