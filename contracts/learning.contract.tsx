import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getDefaultChildProfile,
  listDefaultChildWeaknesses,
  type ChildProfileDto,
  type LearningWeaknessDto,
} from "../src/api/learning.js";
import { calculateSubjectHexagonScores } from "../src/chat/learningHexagon.js";
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
    updatedAt: "2026-08-18T09:30:00+08:00",
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
  {
    weaknessId: "weakness-c",
    userId: "user-a",
    childId: "default",
    subject: "english",
    grade: "first_grade",
    category: "phonics",
    title: "b/d 字母认反",
    evidence: "经常把 b 和 d 看反。",
    severity: "medium",
    status: "active",
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T10:00:00+08:00",
  },
  {
    weaknessId: "weakness-d",
    userId: "user-a",
    childId: "default",
    subject: "math",
    grade: "first_grade",
    category: "calculation",
    title: "口算慢",
    evidence: "10 以内口算会停很久。",
    severity: "high",
    status: "active",
    createdAt: "2026-08-18T00:00:00Z",
    updatedAt: "2026-08-18T10:20:00+08:00",
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
    if (path.endsWith("?subject=math")) {
      return new Response(
        JSON.stringify(weaknesses.filter((item) => item.subject === "math")),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify(weaknesses), { status: 200 });
  };

  const loadedProfile = await getDefaultChildProfile("user-a");
  const loadedWeaknesses = await listDefaultChildWeaknesses("user-a");
  const loadedMathWeaknesses = await listDefaultChildWeaknesses("user-a", {
    subject: "math",
  });

  assert.equal(loadedProfile.childId, "default");
  assert.equal(loadedWeaknesses.length, 4);
  assert.equal(loadedMathWeaknesses.length, 1);
  assert.equal(loadedMathWeaknesses[0].subject, "math");
  assert.match(paths[0], /\/users\/user-a\/children\/default\/profile$/);
  assert.match(paths[1], /\/users\/user-a\/children\/default\/weaknesses$/);
  assert.match(
    paths[2],
    /\/users\/user-a\/children\/default\/weaknesses\?subject=math$/,
  );
} finally {
  globalThis.fetch = originalFetch;
}

const scores = calculateSubjectHexagonScores(weaknesses);
assert.equal(scores.math.dimensions.calculation, 64);
assert.equal(scores.english.dimensions.phonics, 76);
assert.equal(scores.chinese.dimensions.pinyin, 76);

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
assert.match(html, /3<\/strong><span>进行中/);
assert.match(html, /learning-profile-body/);
assert.match(html, /learning-hexagon-canvas/);
assert.match(html, /全部/);
assert.match(html, /b\/p\/d\/q 混淆/);
assert.match(html, /b\/d 字母认反/);
assert.match(html, /口算慢/);
assert.match(html, /拼音/);
assert.match(html, /语文/);
assert.match(html, /英语/);
assert.match(html, /数学/);
assert.match(html, /中等/);
assert.match(html, /更新/);
assert.match(html, /8\/18/);
assert.doesNotMatch(html, /2<\/strong><span>进行中/);

const css = await readFile("src/App.css", "utf8");
assert.match(css, /\.learning-subject-filter/);
assert.match(css, /\.learning-hexagon-canvas/);
assert.match(
  css,
  /\.learning-profile-panel\s*{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/s,
);
assert.match(css, /\.learning-profile-body\s*{[^}]*overflow-y:\s*auto/s);
assert.match(css, /\.learning-profile-body\s*{[^}]*min-height:\s*0/s);
assert.match(css, /\.learning-hexagon-canvas\s*{[^}]*height:\s*248px/s);
assert.match(css, /\.learning-hexagon-legend\s*{[^}]*padding:\s*8px 12px 12px/s);
assert.match(css, /\.learning-hexagon-legend span\s*{[^}]*font-weight:\s*650/s);

const canvasSource = await readFile("src/chat/LearningHexagonCanvas.tsx", "utf8");
assert.match(canvasSource, /drawSubjectLabel/);
assert.match(canvasSource, /score\.label/);
assert.match(canvasSource, /centerY \+ radius \+ 46/);

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
