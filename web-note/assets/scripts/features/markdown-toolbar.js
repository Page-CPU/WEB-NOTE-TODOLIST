// Markdown 工具栏：为编辑器 textarea 提供快捷格式插入能力。
// 支持：标题、粗体、斜体、行内代码、代码块、无序列表、有序列表、链接、分隔线、引用、删除线、任务列表

import { dom } from "../ui/dom.js";

// ── 格式化定义 ────────────────────────────────────────────────────────────────

const FORMAT_ACTIONS = {
  h1:            { type: "line-prefix", prefix: "# " },
  h2:            { type: "line-prefix", prefix: "## " },
  h3:            { type: "line-prefix", prefix: "### " },
  bold:          { type: "wrap", before: "**", after: "**", placeholder: "粗体文本" },
  italic:        { type: "wrap", before: "*", after: "*", placeholder: "斜体文本" },
  strikethrough: { type: "wrap", before: "~~", after: "~~", placeholder: "删除线文本" },
  code:          { type: "wrap", before: "`", after: "`", placeholder: "代码" },
  codeblock:     { type: "block", before: "```\n", after: "\n```", placeholder: "代码块" },
  quote:         { type: "line-prefix", prefix: "> " },
  ul:            { type: "line-prefix", prefix: "- " },
  ol:            { type: "line-prefix", prefix: "1. " },
  tasklist:      { type: "line-prefix", prefix: "- [ ] " },
  link:          { type: "link" },
  hr:            { type: "insert", text: "\n---\n" },
};

// ── 核心格式化逻辑 ──────────────────────────────────────────────────────────────

function applyFormat(action) {
  const textarea = dom.noteArea;
  if (!textarea) return;

  textarea.focus();

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;
  const selected = value.substring(start, end);

  let result;

  switch (action.type) {
    case "wrap":
      result = wrapSelection(value, start, end, selected, action);
      break;
    case "line-prefix":
      result = applyLinePrefix(value, start, end, selected, action);
      break;
    case "block":
      result = insertBlock(value, start, end, selected, action);
      break;
    case "link":
      result = insertLink(value, start, end, selected);
      break;
    case "insert":
      result = insertText(value, start, action);
      break;
    default:
      return;
  }

  textarea.value = result.text;
  textarea.selectionStart = result.selectionStart;
  textarea.selectionEnd = result.selectionEnd;
  textarea.dispatchEvent(new Event("input"));
}

// ── 格式化策略 ──────────────────────────────────────────────────────────────────

/**
 * 包裹选中文本，例如 **选中文本**
 * 如果已包裹则取消包裹（toggle）
 */
function wrapSelection(value, start, end, selected, action) {
  const { before, after, placeholder } = action;

  // 检测是否已包裹 → toggle 取消
  const prevText = value.substring(start - before.length, start);
  const nextText = value.substring(end, end + after.length);
  if (prevText === before && nextText === after) {
    return {
      text: value.substring(0, start - before.length) + selected + value.substring(end + after.length),
      selectionStart: start - before.length,
      selectionEnd: end - before.length,
    };
  }

  if (selected) {
    const wrapped = before + selected + after;
    return {
      text: value.substring(0, start) + wrapped + value.substring(end),
      selectionStart: start + before.length,
      selectionEnd: start + before.length + selected.length,
    };
  }

  const inserted = before + placeholder + after;
  return {
    text: value.substring(0, start) + inserted + value.substring(end),
    selectionStart: start + before.length,
    selectionEnd: start + before.length + placeholder.length,
  };
}

/**
 * 行首前缀，例如 ## 、- 、> 等
 * 支持多行选中同时添加前缀
 */
function applyLinePrefix(value, start, end, selected, action) {
  const { prefix } = action;

  // 扩展选区到完整行
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const actualEnd = lineEnd === -1 ? value.length : lineEnd;
  const linesText = value.substring(lineStart, actualEnd);
  const lines = linesText.split("\n");

  // 检测是否所有行都已有前缀 → toggle 取消
  const allPrefixed = lines.every((line) => line.startsWith(prefix));

  const newLines = allPrefixed
    ? lines.map((line) => line.substring(prefix.length))
    : lines.map((line) => prefix + line);

  const joined = newLines.join("\n");
  const diff = joined.length - linesText.length;

  return {
    text: value.substring(0, lineStart) + joined + value.substring(actualEnd),
    selectionStart: lineStart,
    selectionEnd: actualEnd + diff,
  };
}

/**
 * 插入代码块等块级元素
 */
function insertBlock(value, start, end, selected, action) {
  const { before, after, placeholder } = action;
  const content = selected || placeholder;

  // 确保代码块在新行开始
  const needNewlineBefore = start > 0 && value[start - 1] !== "\n";
  const needNewlineAfter = end < value.length && value[end] !== "\n";

  const prefix = needNewlineBefore ? "\n" : "";
  const suffix = needNewlineAfter ? "\n" : "";

  const inserted = prefix + before + content + after + suffix;

  const contentStart = start + prefix.length + before.length;
  return {
    text: value.substring(0, start) + inserted + value.substring(end),
    selectionStart: contentStart,
    selectionEnd: contentStart + content.length,
  };
}

/**
 * 插入链接 [文本](url)
 */
function insertLink(value, start, end, selected) {
  if (selected) {
    // 选中内容作为链接文字
    const inserted = `[${selected}](url)`;
    const urlStart = start + selected.length + 3; // 跳到 url
    return {
      text: value.substring(0, start) + inserted + value.substring(end),
      selectionStart: urlStart,
      selectionEnd: urlStart + 3,
    };
  }

  const inserted = "[链接文本](url)";
  return {
    text: value.substring(0, start) + inserted + value.substring(end),
    selectionStart: start + 1,
    selectionEnd: start + 5, // 选中"链接文本"
  };
}

/**
 * 直接插入文本（如分隔线）
 */
function insertText(value, start, action) {
  const { text } = action;
  return {
    text: value.substring(0, start) + text + value.substring(start),
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

// ── 工具栏初始化 ──────────────────────────────────────────────────────────────

export function initMarkdownToolbar() {
  const toolbar = document.getElementById("md-toolbar");
  if (!toolbar) return;

  toolbar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-md-action]");
    if (!btn) return;

    e.preventDefault();
    const actionKey = btn.dataset.mdAction;
    const action = FORMAT_ACTIONS[actionKey];
    if (action) applyFormat(action);
  });

  // 标题下拉菜单
  const headingBtn = toolbar.querySelector(".md-heading-btn");
  const headingMenu = toolbar.querySelector(".md-heading-menu");
  if (headingBtn && headingMenu) {
    headingBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      headingMenu.classList.toggle("hidden");
    });

    headingMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-md-action]");
      if (item) headingMenu.classList.add("hidden");
    });

    document.addEventListener("click", (e) => {
      if (!headingBtn.contains(e.target) && !headingMenu.contains(e.target)) {
        headingMenu.classList.add("hidden");
      }
    });
  }
}

// ── 键盘快捷键 ──────────────────────────────────────────────────────────────────

export function initMarkdownShortcuts() {
  const textarea = dom.noteArea;
  if (!textarea) return;

  textarea.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;

    let actionKey = null;

    switch (e.key.toLowerCase()) {
      case "b": actionKey = "bold"; break;
      case "i": actionKey = "italic"; break;
      case "k": actionKey = "link"; break;
      case "e": actionKey = "code"; break;
      case "d": actionKey = "strikethrough"; break;
      default: return;
    }

    if (actionKey) {
      e.preventDefault();
      const action = FORMAT_ACTIONS[actionKey];
      if (action) applyFormat(action);
    }
  });
}
