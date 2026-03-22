// Markdown 工具栏：浮动选中工具栏 + 块级插入菜单
// 选中文本时弹出浮动工具栏；块级操作通过 header 中的 + 菜单触发。

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

function wrapSelection(value, start, end, selected, action) {
  const { before, after, placeholder } = action;

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

function applyLinePrefix(value, start, end, selected, action) {
  const { prefix } = action;

  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", end);
  const actualEnd = lineEnd === -1 ? value.length : lineEnd;
  const linesText = value.substring(lineStart, actualEnd);
  const lines = linesText.split("\n");

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

function insertBlock(value, start, end, selected, action) {
  const { before, after, placeholder } = action;
  const content = selected || placeholder;

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

function insertLink(value, start, end, selected) {
  if (selected) {
    const inserted = `[${selected}](url)`;
    const urlStart = start + selected.length + 3;
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
    selectionEnd: start + 5,
  };
}

function insertText(value, start, action) {
  const { text } = action;
  return {
    text: value.substring(0, start) + text + value.substring(start),
    selectionStart: start + text.length,
    selectionEnd: start + text.length,
  };
}

// ── 浮动工具栏：选中文本时弹出 ──────────────────────────────────────────────────

let hideTimer = null;

function getCaretCoordinates(textarea, position) {
  // 创建镜像 div 来计算光标像素位置
  const mirror = document.createElement("div");
  const computed = getComputedStyle(textarea);

  mirror.style.cssText = `
    position: absolute; visibility: hidden; white-space: pre-wrap;
    word-wrap: break-word; overflow: hidden; pointer-events: none;
    width: ${computed.width};
    font: ${computed.font};
    letter-spacing: ${computed.letterSpacing};
    line-height: ${computed.lineHeight};
    padding: ${computed.padding};
    border: ${computed.border};
    box-sizing: ${computed.boxSizing};
    tab-size: ${computed.tabSize};
  `;

  document.body.appendChild(mirror);

  const textBefore = textarea.value.substring(0, position);
  const textNode = document.createTextNode(textBefore);
  mirror.appendChild(textNode);

  const span = document.createElement("span");
  span.textContent = textarea.value.substring(position) || ".";
  mirror.appendChild(span);

  const coords = {
    top: span.offsetTop - textarea.scrollTop,
    left: span.offsetLeft - textarea.scrollLeft,
  };

  document.body.removeChild(mirror);
  return coords;
}

function positionFloatToolbar(toolbar, textarea) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  // 用选区中点来定位
  const midPos = Math.floor((start + end) / 2);
  const coords = getCaretCoordinates(textarea, midPos);
  const rect = textarea.getBoundingClientRect();

  const toolbarWidth = toolbar.offsetWidth || 240;
  const toolbarHeight = toolbar.offsetHeight || 34;

  let left = rect.left + coords.left - toolbarWidth / 2;
  let top = rect.top + coords.top - toolbarHeight - 8;

  // 边界修正
  const margin = 8;
  if (left < margin) left = margin;
  if (left + toolbarWidth > window.innerWidth - margin) {
    left = window.innerWidth - toolbarWidth - margin;
  }
  if (top < margin) {
    // 显示在选区下方
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    top = rect.top + coords.top + lineHeight + 4;
  }

  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top}px`;
}

function showFloatToolbar() {
  const toolbar = document.getElementById("md-float-toolbar");
  const textarea = dom.noteArea;
  if (!toolbar || !textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;

  if (start === end || document.activeElement !== textarea) {
    hideFloatToolbar();
    return;
  }

  clearTimeout(hideTimer);

  // 先显示（以获取尺寸），再定位
  toolbar.classList.remove("hidden", "fade-out");
  toolbar.style.position = "fixed";
  positionFloatToolbar(toolbar, textarea);
}

function hideFloatToolbar() {
  const toolbar = document.getElementById("md-float-toolbar");
  if (!toolbar || toolbar.classList.contains("hidden")) return;

  clearTimeout(hideTimer);
  toolbar.classList.add("fade-out");
  hideTimer = setTimeout(() => {
    toolbar.classList.add("hidden");
    toolbar.classList.remove("fade-out");
  }, 120);
}

export function initMarkdownToolbar() {
  const floatToolbar = document.getElementById("md-float-toolbar");
  const textarea = dom.noteArea;

  // ── 浮动工具栏事件 ──
  if (floatToolbar && textarea) {
    // 点击按钮执行格式化
    floatToolbar.addEventListener("mousedown", (e) => {
      // 阻止默认行为以保持 textarea 的选区
      e.preventDefault();
    });

    floatToolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-md-action]");
      if (!btn) return;

      e.preventDefault();
      const actionKey = btn.dataset.mdAction;
      const action = FORMAT_ACTIONS[actionKey];
      if (action) {
        applyFormat(action);
        hideFloatToolbar();
      }
    });

    // 监听选区变化
    let selectionCheckTimer = null;
    textarea.addEventListener("select", () => {
      clearTimeout(selectionCheckTimer);
      selectionCheckTimer = setTimeout(showFloatToolbar, 150);
    });

    textarea.addEventListener("mouseup", () => {
      clearTimeout(selectionCheckTimer);
      selectionCheckTimer = setTimeout(showFloatToolbar, 100);
    });

    textarea.addEventListener("keyup", (e) => {
      if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Home" || e.key === "End")) {
        clearTimeout(selectionCheckTimer);
        selectionCheckTimer = setTimeout(showFloatToolbar, 150);
      }
    });

    // 失焦时隐藏（延迟以允许点击工具栏按钮）
    textarea.addEventListener("blur", () => {
      setTimeout(() => {
        if (!floatToolbar.contains(document.activeElement)) {
          hideFloatToolbar();
        }
      }, 200);
    });

    // 点击其他区域隐藏
    document.addEventListener("mousedown", (e) => {
      if (!floatToolbar.contains(e.target) && e.target !== textarea) {
        hideFloatToolbar();
      }
    });

    // 滚动时隐藏
    textarea.addEventListener("scroll", hideFloatToolbar);
  }

  // ── Md 按钮切换横向工具栏 ──
  const toggleBtn = document.getElementById("md-toggle-btn");
  const mdToolbar = document.getElementById("md-toolbar");

  if (toggleBtn && mdToolbar) {
    toggleBtn.addEventListener("click", () => {
      const isHidden = mdToolbar.classList.toggle("hidden");
      toggleBtn.classList.toggle("active", !isHidden);
      // 记住偏好
      try { localStorage.setItem("md-toolbar-visible", isHidden ? "0" : "1"); } catch {}
    });

    // 工具栏按钮点击
    mdToolbar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-md-action]");
      if (!btn) return;

      e.preventDefault();
      const actionKey = btn.dataset.mdAction;
      const action = FORMAT_ACTIONS[actionKey];
      if (action) applyFormat(action);
    });

    // 恢复上次偏好
    try {
      if (localStorage.getItem("md-toolbar-visible") === "1") {
        mdToolbar.classList.remove("hidden");
        toggleBtn.classList.add("active");
      }
    } catch {}
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
