// 最小化 Markdown -> HTML 转换器
// 支持：h1-h3、粗体、斜体、删除线、行内代码、代码块、无序列表、有序列表、
//       任务列表、引用块、链接、分隔线、段落

// ── 预编译正则 ─────────────────────────────────────────────────────────────────

const RE_CODE_FENCE = /^```/;
const RE_HR_DASH = /^-{3,}$/;
const RE_HR_STAR = /^\*{3,}$/;
const RE_HEADING = /^(#{1,3})\s+(.+)$/;
const RE_BLOCKQUOTE = /^&gt;\s?/;
const RE_BLOCKQUOTE_STRIP = /^&gt;\s?/;
const RE_TASK_ITEM = /^[-*]\s+\[([ xX])\]\s+/;
const RE_TASK_ITEM_FULL = /^[-*]\s+\[([ xX])\]\s+(.+)$/;
const RE_UL_ITEM = /^[-*]\s+/;
const RE_OL_ITEM = /^\d+\.\s+/;

export function markdownToHtml(src) {
  const escaped = escapeHtml(src);
  const lines = escaped.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── 代码块 ──
    if (RE_CODE_FENCE.test(line.trimStart())) {
      const codeLines = [];
      i++;
      while (i < lines.length && !RE_CODE_FENCE.test(lines[i].trimStart())) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    // ── 空行 ──
    if (trimmed === "") {
      i++;
      continue;
    }

    // ── 分隔线 ──
    if (RE_HR_DASH.test(trimmed) || RE_HR_STAR.test(trimmed)) {
      out.push("<hr>");
      i++;
      continue;
    }

    // ── 标题 ──
    const headingMatch = line.match(RE_HEADING);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // ── 引用块 ──
    if (RE_BLOCKQUOTE.test(trimmed)) {
      const quoteLines = [];
      while (i < lines.length && RE_BLOCKQUOTE.test(lines[i].trim())) {
        quoteLines.push(inline(lines[i].trim().replace(RE_BLOCKQUOTE_STRIP, "")));
        i++;
      }
      out.push(`<blockquote>${quoteLines.map((l) => `<p>${l}</p>`).join("")}</blockquote>`);
      continue;
    }

    // ── 任务列表 ──
    if (RE_TASK_ITEM.test(trimmed)) {
      const items = [];
      while (i < lines.length && RE_TASK_ITEM.test(lines[i].trim())) {
        const m = lines[i].trim().match(RE_TASK_ITEM_FULL);
        if (m) {
          const checked = m[1] !== " ";
          const text = m[2];
          items.push(
            `<li class="task-item${checked ? " is-done" : ""}">` +
            `<input type="checkbox"${checked ? " checked" : ""}> <span>${inline(text)}</span></li>`
          );
        }
        i++;
      }
      out.push(`<ul class="task-list">${items.join("")}</ul>`);
      continue;
    }

    // ── 无序列表 ──
    if (RE_UL_ITEM.test(trimmed)) {
      const items = [];
      while (i < lines.length && RE_UL_ITEM.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(RE_UL_ITEM, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    // ── 有序列表 ──
    if (RE_OL_ITEM.test(trimmed)) {
      const items = [];
      while (i < lines.length && RE_OL_ITEM.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(RE_OL_ITEM, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    // ── 段落 ──
    out.push(`<p>${inline(line)}</p>`);
    i++;
  }

  return out.join("\n");
}

function sanitizeHref(url) {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith("http:") || trimmed.startsWith("https:") || trimmed.startsWith("mailto:")) {
    return url.trim();
  }
  return "";
}

function inline(text) {
  return text
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const safe = sanitizeHref(href);
      return safe ? `<a href="${safe}" target="_blank" rel="noopener">${label}</a>` : label;
    });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
