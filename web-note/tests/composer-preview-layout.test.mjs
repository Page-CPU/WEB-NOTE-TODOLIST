import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../style.css", import.meta.url), "utf8");
const editorJs = readFileSync(new URL("../assets/scripts/features/editor.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// ── Composer 布局 ─────────────────────────────────────────────────────────────

// quadrant-picker 应该能自然占满宽度，日历图标按钮不争空间
assert.match(
  html,
  /class="quadrant-picker"[\s\S]*?class="due-date-picker"/s,
  "due-date-picker should follow quadrant-picker in the same row",
);

// due-date-btn 应是图标按钮（无文本标签）
assert.match(
  html,
  /id="due-date-btn"[\s\S]*?due-date-icon[\s\S]*?due-date-dot/s,
  "due-date button should be icon-only with a dot indicator",
);

// 自定义日历弹层存在
assert.match(
  html,
  /id="date-popover"[\s\S]*?dp-header[\s\S]*?dp-grid[\s\S]*?dp-footer/s,
  "custom date picker popover should be present in HTML",
);

// ── 预览模式控件隐藏 ──────────────────────────────────────────────────────────

// setEditorMode 应隐藏 density-toggle
assert.match(
  editorJs,
  /densityToggle[\s\S]*?classList\.toggle\(\s*"hidden"\s*,\s*isPreview\s*\)/s,
  "preview mode should toggle hidden on density-toggle",
);

// setEditorMode 应隐藏 md-block-insert
assert.match(
  editorJs,
  /mdBlockInsert[\s\S]*?classList\.toggle\(\s*"hidden"\s*,\s*isPreview\s*\)/s,
  "preview mode should toggle hidden on md-block-insert",
);

// 预览时强制收起 md-toolbar 并清理 Md 按钮 active 状态
assert.match(
  editorJs,
  /mdToolbar[\s\S]*?classList\.add\(\s*"hidden"\s*\)/s,
  "preview mode should force-collapse md-toolbar",
);

assert.match(
  editorJs,
  /mdToggleBtn[\s\S]*?classList\.remove\(\s*"active"\s*\)/s,
  "preview mode should clear md-toggle-btn active state",
);

// 切回编辑时应从 localStorage 恢复工具栏偏好
assert.match(
  editorJs,
  /localStorage\.getItem\(\s*"md-toolbar-visible"\s*\)/s,
  "switching back to edit should restore toolbar visibility from localStorage",
);

console.log("composer layout and preview controls verified");
