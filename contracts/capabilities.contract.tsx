import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  listCapabilities,
  type CapabilityCatalogDto,
} from "../src/api/capabilities.js";
import { CapabilityPanel } from "../src/chat/CapabilityPanel.js";

const originalFetch = globalThis.fetch;

const catalog: CapabilityCatalogDto = {
  schemaVersion: "capability.v1",
  supportedTypes: ["tool", "skill"],
  capabilities: [
    {
      id: "tool.calculator",
      type: "tool",
      name: "calculator",
      displayName: "Calculator",
      description: "计算数学表达式。",
      category: "基础工具",
      status: "available",
      source: "local",
      enabled: true,
    },
    {
      id: "tool.search_knowledge",
      type: "tool",
      name: "search_knowledge",
      displayName: "Search Knowledge",
      description: "搜索知识库。",
      category: "知识检索",
      status: "available",
      source: "local",
      enabled: true,
    },
  ],
};

try {
  let requestSeen = false;
  globalThis.fetch = async (input) => {
    requestSeen = true;
    assert.match(String(input), /\/capabilities$/);
    return new Response(JSON.stringify(catalog), { status: 200 });
  };

  const loaded = await listCapabilities();
  assert.equal(requestSeen, true);
  assert.equal(loaded.schemaVersion, "capability.v1");
  assert.deepEqual(loaded.supportedTypes, ["tool", "skill"]);
  assert.equal(loaded.capabilities[0].id, "tool.calculator");
} finally {
  globalThis.fetch = originalFetch;
}

const html = renderToStaticMarkup(
  createElement(CapabilityPanel, {
    catalog,
    loading: false,
    onRetry: () => undefined,
  }),
);

assert.match(html, /能力中心/);
assert.match(html, /Calculator/);
assert.match(html, /Search Knowledge/);
assert.match(html, /Tool/);
assert.match(html, /Skill/);

const loadingHtml = renderToStaticMarkup(
  createElement(CapabilityPanel, {
    loading: true,
    onRetry: () => undefined,
  }),
);
assert.match(loadingHtml, /加载中/);

const errorHtml = renderToStaticMarkup(
  createElement(CapabilityPanel, {
    loading: false,
    error: "能力目录加载失败",
    onRetry: () => undefined,
  }),
);
assert.match(errorHtml, /能力目录加载失败/);
assert.match(errorHtml, /重试/);

console.log("capabilities contracts passed");
