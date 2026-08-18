import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getDefaultChildProfile,
  listDefaultChildWeaknesses,
  type ChildProfileDto,
  type LearningWeaknessDto,
} from "../src/api/learning.js";
import { LearningProfilePanel } from "../src/chat/LearningProfilePanel.js";

const originalFetch = globalThis.fetch;

const profile: ChildProfileDto = {
  userId: "user-a",
  childId: "default",
  displayName: "孩子",
  grade: "first_grade",
  createdAt: "2026-08-18T00:00:00Z",
  updatedAt: "2026-08-18T00:00:00Z",
};

const weaknesses: LearningWeaknessDto[] = [
  {
    weaknessId: "weakness-a",
    userId: "user-a",
    childId: "default",
    subject: "chinese",
    grade: "first_grade",
    category: "pinyin",
    title: "b/p/d/q 混淆",
    evidence: "拼读时经常混淆。",
    severity: "medium",
    status: "active",
    sourceRunId: "run-a",
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T00:00:00Z",
  },
  {
    weaknessId: "weakness-b",
    userId: "user-a",
    childId: "default",
    subject: "chinese",
    grade: "first_grade",
    category: "reading",
    title: "朗读漏字",
    evidence: "朗读时漏字。",
    severity: "mild",
    status: "resolved",
    createdAt: "2026-08-17T00:00:00Z",
    updatedAt: "2026-08-17T00:00:00Z",
  },
];

try {
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    const path = String(input);
    paths.push(path);
    if (path.endsWith("/profile")) {
      return new Response(JSON.stringify(profile), { status: 200 });
    }
    return new Response(JSON.stringify(weaknesses), { status: 200 });
  };

  const loadedProfile = await getDefaultChildProfile("user-a");
  const loadedWeaknesses = await listDefaultChildWeaknesses("user-a");

  assert.equal(loadedProfile.childId, "default");
  assert.equal(loadedWeaknesses.length, 2);
  assert.match(paths[0], /\/users\/user-a\/children\/default\/profile$/);
  assert.match(paths[1], /\/users\/user-a\/children\/default\/weaknesses$/);
} finally {
  globalThis.fetch = originalFetch;
}

const html = renderToStaticMarkup(
  createElement(LearningProfilePanel, {
    profile,
    weaknesses,
    loading: false,
    onRetry: () => undefined,
  }),
);

assert.match(html, /学习画像/);
assert.match(html, /一年级/);
assert.match(html, /1<\/strong><span>进行中/);
assert.match(html, /b\/p\/d\/q 混淆/);
assert.match(html, /拼音/);
assert.match(html, /中等/);
assert.doesNotMatch(html, /2<\/strong><span>进行中/);

const emptyHtml = renderToStaticMarkup(
  createElement(LearningProfilePanel, {
    profile,
    weaknesses: [],
    loading: false,
    onRetry: () => undefined,
  }),
);
assert.match(emptyHtml, /暂无薄弱点记录/);

const loadingHtml = renderToStaticMarkup(
  createElement(LearningProfilePanel, {
    loading: true,
    onRetry: () => undefined,
  }),
);
assert.match(loadingHtml, /加载中/);

const errorHtml = renderToStaticMarkup(
  createElement(LearningProfilePanel, {
    loading: false,
    error: "学习画像加载失败",
    onRetry: () => undefined,
  }),
);
assert.match(errorHtml, /学习画像加载失败/);
assert.match(errorHtml, /重试/);

console.log("learning contracts passed");
