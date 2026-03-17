import { PAGE_ID } from "../core/config.js";

const drawer = document.getElementById("pages-drawer");
const list = document.getElementById("pages-list");
const toggleBtn = document.getElementById("pages-toggle-btn");
const closeBtn = document.getElementById("pages-drawer-close");
const newBtn = document.getElementById("pages-new-btn");

let loaded = false;

export function togglePagesDrawer() {
  if (!drawer) return;
  const isOpen = !drawer.classList.contains("hidden");
  drawer.classList.toggle("hidden", isOpen);
  if (!isOpen && !loaded) {
    loadPages();
  }
}

export function closePagesDrawer() {
  drawer?.classList.add("hidden");
}

async function loadPages() {
  if (!list) return;
  list.innerHTML = '<li class="pages-loading">加载中…</li>';

  try {
    const res = await fetch("/api/pages", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    loaded = true;
    renderPagesList(data.pages ?? []);
  } catch (e) {
    list.innerHTML = '<li class="pages-loading">加载失败</li>';
  }
}

function renderPagesList(pages) {
  if (!list) return;
  list.innerHTML = "";

  if (pages.length === 0) {
    list.innerHTML = '<li class="pages-empty">暂无页面</li>';
    return;
  }

  pages.forEach((page) => {
    const li = document.createElement("li");
    li.className = "pages-item";
    if (page.page_id === PAGE_ID) {
      li.classList.add("is-current");
    }

    const link = document.createElement("a");
    link.href = `/${page.page_id}`;
    link.className = "pages-item-link";

    const title = document.createElement("span");
    title.className = "pages-item-title";
    title.textContent = page.preview || `/${page.page_id}`;

    const meta = document.createElement("span");
    meta.className = "pages-item-meta";
    const parts = [];
    if (page.last_modified) {
      parts.push(formatRelativeTime(page.last_modified));
    }
    if (page.todo_total > 0) {
      parts.push(`${page.todo_done}/${page.todo_total} 任务`);
    }
    meta.textContent = parts.join(" · ");

    link.append(title, meta);
    li.appendChild(link);
    list.appendChild(li);
  });
}

function formatRelativeTime(isoString) {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin} 分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} 小时前`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay} 天前`;
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(isoString));
}

// ── 事件绑定 ────────────────────────────────────────────────────────────────

if (toggleBtn) {
  toggleBtn.addEventListener("click", togglePagesDrawer);
}
if (closeBtn) {
  closeBtn.addEventListener("click", closePagesDrawer);
}
if (newBtn) {
  newBtn.addEventListener("click", () => {
    window.location.href = "/";
  });
}
