// 最小化 Markdown -> HTML 转换器
// 支持：h1-h3、粗体、斜体、行内代码、代码块、无序列表、有序列表、链接、分隔线、段落

export function markdownToHtml(src) {
  const escaped = escapeHtml(src);
  const lines = escaped.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trimStart().startsWith("```")) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (/^-{3,}$/.test(line.trim()) || /^\*{3,}$/.test(line.trim())) {
      out.push("<hr>");
      i++;
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inline(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^[\-\*]\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[\-\*]\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^[\-\*]\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(`<li>${inline(lines[i].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

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
