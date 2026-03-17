// 应用入口：偏好恢复、事件绑定、首次数据加载。
// 本模块只做"连线"工作，不包含业务逻辑。

import { PAGE_ID, CLEAR_DONE_CONFIRM_THRESHOLD } from "./core/config.js";
import { state } from "./core/state.js";
import {
  loadEditorDensityPreference,
  loadMainViewPreference,
  loadFilterPreference,
  getThemePreference,
} from "./core/storage.js";
import { loadPageData, persistNow, queueSave, saveWithBeacon } from "./core/api.js";
import { setSaveStatus, setLastModified, markLastModifiedNow } from "./features/save-status.js";
import { setTheme, applyThemeFromPreference } from "./features/theme.js";
import {
  setEditorDensity, setMainView, updateLineNumbers, updateEditorMeta,
} from "./features/editor.js";
import { addTodo, setFilter, setSelectedQuadrant } from "./features/todos.js";
import { initMobileNavigation, setMobileTasksView } from "./features/navigation.js";
import { dom, quadrantMenuRoot, showToast, removeToast, hideSkeleton } from "./ui/dom.js";
import { renderTodos, closeQuadrantMenu } from "./ui/render.js";
import { setupActions } from "./core/actions.js";

// ── 视图切换 ──────────────────────────────────────────────────────────────────

if (dom.openQuadrantsBtn) {
  dom.openQuadrantsBtn.addEventListener("click", () => {
    if (state.isMobile) {
      setMobileTasksView(state.mobileTasksView === "matrix" ? "list" : "matrix");
      return;
    }
    setMainView(state.mainView === "quadrants" ? "editor" : "quadrants");
  });
}
if (dom.closeQuadrantsBtn) {
  dom.closeQuadrantsBtn.addEventListener("click", () => {
    if (state.isMobile) {
      setMobileTasksView("list");
      return;
    }
    setMainView("editor");
  });
}

// ── 编辑器密度 ────────────────────────────────────────────────────────────────

if (dom.densityToggle) {
  dom.densityToggle.querySelectorAll(".density-chip").forEach((chip) => {
    chip.addEventListener("click", () => setEditorDensity(chip.dataset.density));
  });
}

// ── 四象限选择器（新增任务用）────────────────────────────────────────────────

if (dom.todoQuadrantPicker) {
  dom.todoQuadrantPicker.querySelectorAll(".quadrant-chip").forEach((chip) => {
    chip.addEventListener("click", () => setSelectedQuadrant(chip.dataset.quadrant));
  });
}

// ── 新增任务 ──────────────────────────────────────────────────────────────────

if (dom.addBtn) dom.addBtn.addEventListener("click", addTodo);
if (dom.todoInput) {
  dom.todoInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") addTodo();
  });
}

// ── 保存状态点击重试 ──────────────────────────────────────────────────────────

if (dom.saveIndicator) {
  const tryRetry = () => {
    if (!dom.saveIndicator.classList.contains("error") || !state.lastErrorType) return;
    if (state.lastErrorType === "load") loadPageData();
    else persistNow(state.queuedStatusText);
  };
  dom.saveIndicator.addEventListener("click", tryRetry);
  dom.saveIndicator.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && dom.saveIndicator.classList.contains("error")) {
      e.preventDefault();
      tryRetry();
    }
  });
}

// ── 复制链接 ──────────────────────────────────────────────────────────────────

if (dom.copyLinkBtn) {
  if (!PAGE_ID) dom.copyLinkBtn.classList.add("hidden");
  dom.copyLinkBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      const toastEl = showToast("已备份");
      setTimeout(() => removeToast(toastEl), 2000);
    }).catch(() => {});
  });
}

// ── 全局快捷键 ────────────────────────────────────────────────────────────────

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea, [contenteditable=\"true\"]")) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "n" || e.key === "N" || e.key === "/") {
    e.preventDefault();
    dom.todoInput?.focus();
  }
});

// ── 四象限浮动菜单关闭 ────────────────────────────────────────────────────────

document.addEventListener("click", (event) => {
  if (!state.activeQuadrantMenu) return;
  if (quadrantMenuRoot.contains(event.target)) return;
  if (event.target.closest(".todo-quadrant-badge")) return;
  closeQuadrantMenu();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.activeQuadrantMenu) {
    closeQuadrantMenu();
  }
});
window.addEventListener("resize", closeQuadrantMenu);
window.addEventListener("scroll", closeQuadrantMenu, true);

// ── 任务筛选标签 ──────────────────────────────────────────────────────────────

document.querySelectorAll(".filter-tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
    renderTodos();
  });
});

// ── 空状态 CTA ────────────────────────────────────────────────────────────────

if (dom.todoList) {
  dom.todoList.addEventListener("click", (e) => {
    if (e.target.closest(".empty-cta")) {
      e.preventDefault();
      dom.todoInput?.focus();
    }
  });
}

// ── 清除已完成 ────────────────────────────────────────────────────────────────

if (dom.clearDoneBtn) {
  dom.clearDoneBtn.addEventListener("click", () => {
    const doneCount = state.todos.filter((t) => t.done).length;
    if (
      doneCount >= CLEAR_DONE_CONFIRM_THRESHOLD &&
      !window.confirm(`确定清除 ${doneCount} 条已完成任务？`)
    ) return;
    state.todos = state.todos.filter((todo) => !todo.done);
    renderTodos();
    markLastModifiedNow();
    queueSave("已保存");
  });
}

// ── 编辑器滚动同步行号 ────────────────────────────────────────────────────────

if (dom.noteArea && dom.editorLineNumbers) {
  dom.noteArea.addEventListener("scroll", () => {
    dom.editorLineNumbers.scrollTop = dom.noteArea.scrollTop;
  });
}

// ── 编辑器输入 ────────────────────────────────────────────────────────────────

if (dom.noteArea) {
  dom.noteArea.addEventListener("input", () => {
    updateEditorMeta();
    updateLineNumbers();
    markLastModifiedNow();
    queueSave("已保存");
  });
  dom.noteArea.addEventListener("focus", () => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      requestAnimationFrame(() => {
        dom.noteArea.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    }
  });
}

// ── 主题切换 ──────────────────────────────────────────────────────────────────

if (dom.themeToggleBtn) {
  dom.themeToggleBtn.addEventListener("click", () => {
    const current = getThemePreference();
    setTheme(current === "light" ? "dark" : "light");
  });
}

// ── 页面关闭前保存 ────────────────────────────────────────────────────────────

window.addEventListener("beforeunload", saveWithBeacon);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveWithBeacon();
});

// ── 初始化 ────────────────────────────────────────────────────────────────────

// 必须在所有事件绑定之前完成注入，使 actions.js 持有正确的函数引用。
setupActions({ renderTodos, queueSave });

setEditorDensity(loadEditorDensityPreference(), false);
setMainView(loadMainViewPreference(), false);
setFilter(loadFilterPreference(), false);
setSelectedQuadrant(state.selectedQuadrant);
setLastModified(null);
applyThemeFromPreference();
updateLineNumbers();
initMobileNavigation();

if (dom.pageCode) dom.pageCode.textContent = PAGE_ID ? `/${PAGE_ID}` : "/";
if (PAGE_ID) {
  document.title = `A Note · ${PAGE_ID}`;
  loadPageData();
} else {
  renderTodos();
  setSaveStatus("error", "页面无效");
  hideSkeleton();
}
