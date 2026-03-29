// 所有 DOM 元素引用的统一出口，以及 toast、skeleton、滚动工具函数。
// 本模块不依赖 state，保持纯 DOM 操作。

export const dom = {
  sidebar:             document.getElementById("sidebar"),
  main:                document.getElementById("main"),
  todoInput:           document.getElementById("todo-input"),
  todoQuadrantPicker:  document.getElementById("todo-quadrant"),
  dueDateBtn:          document.getElementById("due-date-btn"),
  addBtn:              document.getElementById("add-btn"),
  todoList:            document.getElementById("todo-list"),
  openQuadrantsBtn:    document.getElementById("open-quadrants-btn"),
  closeQuadrantsBtn:   document.getElementById("close-quadrants-btn"),
  editorFrame:         document.getElementById("editor-frame"),
  quadrantFrame:       document.getElementById("quadrant-frame"),
  countBadge:          document.getElementById("count-badge"),
  clearDoneBtn:        document.getElementById("clear-done-btn"),
  noteArea:            document.getElementById("note-area"),
  editorLineNumbers:   document.getElementById("editor-line-numbers"),
  editorSurface:       document.querySelector(".editor-surface"),
  saveIndicator:       document.getElementById("save-indicator"),
  saveLabel:           document.getElementById("save-label"),
  charCount:           document.getElementById("char-count"),
  lineCount:           document.getElementById("line-count"),
  lastModified:        document.getElementById("last-modified"),
  densityToggle:       document.getElementById("density-toggle"),
  themeToggleBtn:      document.getElementById("theme-toggle-btn"),
  pageCode:            document.getElementById("page-code"),
  copyLinkBtn:         document.getElementById("copy-link-btn"),
  feedbackBtn:         document.getElementById("feedback-btn"),
  feedbackModal:       document.getElementById("feedback-modal"),
  feedbackCloseBtn:    document.getElementById("feedback-close-btn"),
  feedbackForm:        document.getElementById("feedback-form"),
  feedbackType:        document.getElementById("feedback-type"),
  feedbackMessage:     document.getElementById("feedback-message"),
  feedbackContact:     document.getElementById("feedback-contact"),
  feedbackIncludeDebug: document.getElementById("feedback-include-debug"),
  feedbackIncludeContent: document.getElementById("feedback-include-content"),
  feedbackCancelBtn:   document.getElementById("feedback-cancel-btn"),
  feedbackSubmitBtn:   document.getElementById("feedback-submit-btn"),
  feedbackPageMeta:    document.getElementById("feedback-page-meta"),
  mobileTabBar:        document.getElementById("mobile-tab-bar"),
  mobileMatrixToggle:  document.getElementById("mobile-matrix-toggle"),
  todoSummary:         document.getElementById("todo-summary"),
  quadrantSummary:     document.getElementById("quadrant-summary"),
  quadrantBuckets: {
    do:        document.getElementById("quadrant-do"),
    plan:      document.getElementById("quadrant-plan"),
    delegate:  document.getElementById("quadrant-delegate"),
    eliminate: document.getElementById("quadrant-eliminate"),
  },
  quadrantBucketWraps: {
    do:        document.getElementById("quadrant-do-wrap"),
    plan:      document.getElementById("quadrant-plan-wrap"),
    delegate:  document.getElementById("quadrant-delegate-wrap"),
    eliminate: document.getElementById("quadrant-eliminate-wrap"),
  },
};

// ── 浮层根节点 ─────────────────────────────────────────────────────────────────

export const quadrantMenuRoot = document.createElement("div");
quadrantMenuRoot.className = "todo-quadrant-menu hidden";
document.body.appendChild(quadrantMenuRoot);

export const toastRoot = document.createElement("div");
toastRoot.className = "toast-strip";
document.body.appendChild(toastRoot);

// ── Toast ─────────────────────────────────────────────────────────────────────

export function showToast(message, undoLabel, onUndo) {
  const el = document.createElement("div");
  el.className = "toast-item";
  if (undoLabel && onUndo) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-undo";
    btn.textContent = undoLabel;
    btn.addEventListener("click", () => {
      onUndo();
      removeToast(el);
    });
    el.appendChild(document.createTextNode(message + " · "));
    el.appendChild(btn);
  } else {
    el.textContent = message;
  }
  toastRoot.appendChild(el);
  return el;
}

export function removeToast(el) {
  if (el && el.parentNode === toastRoot) el.remove();
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function showSkeleton() {
  if (!dom.todoList || !dom.editorSurface) return;
  dom.todoList.classList.add("skeleton-list");
  dom.todoList.innerHTML = "";
  for (let i = 0; i < 5; i++) {
    const li = document.createElement("li");
    li.className = "skeleton-line";
    dom.todoList.appendChild(li);
  }
  dom.editorSurface.classList.add("skeleton-editor");
}

export function hideSkeleton() {
  if (dom.todoList) dom.todoList.classList.remove("skeleton-list");
  if (dom.editorSurface) dom.editorSurface.classList.remove("skeleton-editor");
  if (dom.todoList && dom.todoList.querySelector(".skeleton-line")) {
    dom.todoList.innerHTML = "";
  }
}

// ── 滚动工具 ──────────────────────────────────────────────────────────────────

export function scrollItemIntoView(container, item) {
  if (!container || !item) return;
  const itemTop = item.offsetTop;
  const itemBottom = itemTop + item.offsetHeight;
  const viewTop = container.scrollTop;
  const viewBottom = viewTop + container.clientHeight;
  if (itemTop < viewTop) {
    container.scrollTop = Math.max(itemTop - 8, 0);
  } else if (itemBottom > viewBottom) {
    container.scrollTop = itemBottom - container.clientHeight + 8;
  }
}

export function captureScrollState() {
  return {
    todoList: dom.todoList ? dom.todoList.scrollTop : 0,
    quadrants: Object.fromEntries(
      Object.entries(dom.quadrantBucketWraps).map(([key, wrap]) => [key, wrap ? wrap.scrollTop : 0])
    ),
  };
}

export function restoreScrollState(scrollState) {
  if (!scrollState) return;
  if (dom.todoList) dom.todoList.scrollTop = scrollState.todoList || 0;
  Object.entries(dom.quadrantBucketWraps).forEach(([key, wrap]) => {
    if (!wrap) return;
    wrap.scrollTop = scrollState.quadrants?.[key] || 0;
  });
}
