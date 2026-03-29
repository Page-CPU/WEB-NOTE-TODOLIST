import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// 两段式布局：save-indicator 在 top 行，last-modified 在 bottom 行
assert.match(
  html,
  /class="status-row-top"[\s\S]*?save-indicator[\s\S]*?class="status-row-bottom"/s,
  "save-indicator should be in the top row, not the bottom row",
);

assert.match(
  html,
  /class="status-row-bottom"[\s\S]*?id="last-modified"/s,
  "last-modified should be in the bottom row",
);

// top 行的 save-indicator 不可压缩
assert.match(
  css,
  /\.status-row-top\s+\.save-indicator\s*\{[^}]*flex-shrink:\s*0\s*;[^}]*\}/s,
  "save-indicator in top row should not shrink",
);

// bottom 行使用 space-between 分组
assert.match(
  css,
  /\.status-row-bottom\s*\{[^}]*justify-content:\s*space-between\s*;[^}]*\}/s,
  "bottom row should use space-between for left/right grouping",
);

// status-actions 容器不可压缩（保证主题按钮始终可见）
assert.match(
  css,
  /\.status-row-bottom\s+\.status-actions\s*\{[^}]*flex-shrink:\s*0\s*;[^}]*\}/s,
  "status-actions group should not shrink to keep theme toggle visible",
);

// last-modified 允许截断作为兜底
assert.match(
  css,
  /#last-modified\s*\{[^}]*overflow:\s*hidden\s*;[^}]*text-overflow:\s*ellipsis\s*;[^}]*\}/s,
  "last-modified chip should truncate as fallback",
);

console.log("status bar layout constraints verified");
