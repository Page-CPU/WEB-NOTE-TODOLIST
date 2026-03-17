import {
  QUADRANT_OPTIONS, TODOS_PAGE_SIZE, TODO_COMPLETE_ANIMATION_MS,
} from "../core/config.js";
import { state } from "../core/state.js";
import {
  dom, quadrantMenuRoot, showToast, removeToast,
  captureScrollState, restoreScrollState, scrollItemIntoView,
} from "./dom.js";
import {
  normalizeUrgency, normalizeImportance, normalizeQuadrant,
  urgencyMeta, importanceMeta, quadrantMeta,
  getQuadrantKey, getVisibleTodos, sortTodos,
  formatTodoMeta, applyQuadrantToTodo, flashTodo,
  startEditingTodo, finishEditingTodo,
} from "../features/todos.js";
import { commitTodosChange } from "../core/actions.js";

// ── 四象限浮动菜单 ────────────────────────────────────────────────────────────

export function closeQuadrantMenu() {
  state.activeQuadrantMenu = null;
  quadrantMenuRoot.classList.add("hidden");
  quadrantMenuRoot.innerHTML = "";
}

export function openQuadrantMenu(todo, badge) {
  const currentKey = getQuadrantKey(todo);

  if (state.activeQuadrantMenu && state.activeQuadrantMenu.todoId === todo.id) {
    closeQuadrantMenu();
    return;
  }

  quadrantMenuRoot.innerHTML = "";

  Object.keys(QUADRANT_OPTIONS).filter((key) => key !== currentKey).forEach((key) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = `todo-quadrant-menu-option quadrant-${key}`;
    option.textContent = quadrantMeta(key).label;
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      applyQuadrantToTodo(todo, key);
      flashTodo(todo.id, 1200);
      state.pendingRevealTodoId = todo.id;
      closeQuadrantMenu();
      commitTodosChange("已保存");
    });
    quadrantMenuRoot.appendChild(option);
  });

  const rect = badge.getBoundingClientRect();
  quadrantMenuRoot.style.left = `${window.scrollX + rect.left}px`;
  quadrantMenuRoot.style.top = `${window.scrollY + rect.bottom + 8}px`;
  quadrantMenuRoot.classList.remove("hidden");
  state.activeQuadrantMenu = { todoId: todo.id };
  requestAnimationFrame(() => quadrantMenuRoot.querySelector("button")?.focus());
}

function createQuadrantBadge(todo) {
  const badge = document.createElement("button");
  badge.type = "button";
  badge.className = `todo-quadrant-badge quadrant-${getQuadrantKey(todo)}`;
  badge.textContent = quadrantMeta(getQuadrantKey(todo)).label;
  badge.title = "点击选择状态";
  badge.setAttribute("aria-label", "点击选择状态");
  badge.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openQuadrantMenu(todo, badge);
  });
  return badge;
}

// ── 拖拽放置 ──────────────────────────────────────────────────────────────────

function bindQuadrantDropTargets() {
  Object.entries(dom.quadrantBucketWraps).forEach(([key, wrap]) => {
    if (!wrap || wrap.dataset.boundDrop === "true") return;
    wrap.dataset.boundDrop = "true";

    wrap.addEventListener("dragover", (event) => {
      if (!state.draggedTodoId) return;
      event.preventDefault();
      wrap.classList.add("is-drop-target");
      wrap.closest(".quadrant-card")?.classList.add("is-drop-target");
    });

    wrap.addEventListener("dragleave", () => {
      wrap.classList.remove("is-drop-target");
      wrap.closest(".quadrant-card")?.classList.remove("is-drop-target");
    });

    wrap.addEventListener("drop", (event) => {
      if (!state.draggedTodoId) return;
      event.preventDefault();
      wrap.classList.remove("is-drop-target");
      wrap.closest(".quadrant-card")?.classList.remove("is-drop-target");
      const todo = state.todos.find((item) => item.id === state.draggedTodoId);
      state.draggedTodoId = "";
      if (!todo || getQuadrantKey(todo) === key) return;
      applyQuadrantToTodo(todo, key);
      flashTodo(todo.id, 1200);
      state.pendingRevealTodoId = todo.id;
      commitTodosChange("已保存");
    });
  });
}

// ── 辅助判断 ──────────────────────────────────────────────────────────────────

function shouldIgnoreEditTrigger(target) {
  return Boolean(
    target?.closest(".check-wrap, .todo-quadrant-badge, .del-btn, .todo-inline-input")
  );
}

// ── Todo 节点创建 ─────────────────────────────────────────────────────────────

function createTodoNode(todo, options = {}) {
  const { showQuadrantBadge = true, draggableInQuadrants = false, allowInlineEdit = true, editContext = "sidebar" } = options;

  const li = document.createElement("li");
  li.className = `todo-item${todo.done ? " done" : ""}`;
  li.dataset.todoId = todo.id;
  li.dataset.urgency = normalizeUrgency(todo.urgency);
  li.dataset.importance = normalizeImportance(todo.importance);

  if (todo.id === state.highlightedTodoId) {
    li.classList.add("is-new");
  }

  if (draggableInQuadrants && !todo.done) {
    li.draggable = true;
    li.classList.add("is-draggable");
    li.addEventListener("dragstart", () => {
      state.draggedTodoId = todo.id;
      closeQuadrantMenu();
      li.classList.add("is-dragging");
    });
    li.addEventListener("dragend", () => {
      state.draggedTodoId = "";
      li.classList.remove("is-dragging");
      Object.values(dom.quadrantBucketWraps).forEach((wrap) => {
        wrap?.classList.remove("is-drop-target");
        wrap?.closest(".quadrant-card")?.classList.remove("is-drop-target");
      });
    });
  }

  // ── 勾选框 ──────────────────────────────────────────────────────────────────

  const checkWrap = document.createElement("label");
  checkWrap.className = "check-wrap";
  checkWrap.tabIndex = 0;
  checkWrap.setAttribute("role", "checkbox");
  checkWrap.setAttribute("aria-label", "切换待办完成状态");
  checkWrap.setAttribute("aria-checked", String(Boolean(todo.done)));

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.done;

  const box = document.createElement("div");
  box.className = `check-box${todo.done ? " checked" : ""}`;

  const toggleTodoDone = (nextDone) => {
    const done = Boolean(nextDone);
    if (done && !todo.done) {
      li.classList.add("is-completing");
      window.setTimeout(() => {
        todo.done = true;
        todo.updated_at = new Date().toISOString();
        state.pendingRevealTodoId = todo.id;
        commitTodosChange("已保存");
      }, TODO_COMPLETE_ANIMATION_MS);
      return;
    }
    todo.done = done;
    todo.updated_at = new Date().toISOString();
    state.pendingRevealTodoId = todo.id;
    commitTodosChange("已保存");
  };

  checkbox.addEventListener("change", () => toggleTodoDone(checkbox.checked));
  checkWrap.append(checkbox, box);
  checkWrap.addEventListener("click", (event) => {
    event.preventDefault();
    toggleTodoDone(!todo.done);
  });
  checkWrap.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleTodoDone(!todo.done);
    }
  });

  // ── 内容区 ───────────────────────────────────────────────────────────────────

  const content = document.createElement("div");
  content.className = "todo-content";

  const topRow = document.createElement("div");
  topRow.className = "todo-main-row";

  if (allowInlineEdit && state.editingTodoId === todo.id && state.editingContext === editContext) {
    const input = document.createElement("textarea");
    input.className = "todo-inline-input";
    input.rows = 1;
    input.value = todo.text;
    input.placeholder = "编辑任务内容";
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); finishEditingTodo(todo.id, input.value, true); }
      if (event.key === "Escape") finishEditingTodo(todo.id, input.value, false);
    });
    input.addEventListener("blur", () => finishEditingTodo(todo.id, input.value, true));
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
    topRow.appendChild(input);
  } else {
    const textNode = document.createElement("span");
    textNode.className = "todo-text";
    textNode.textContent = todo.text;
    textNode.title = "双击编辑任务";
    if (allowInlineEdit) {
      textNode.addEventListener("dblclick", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startEditingTodo(todo.id, editContext);
      });
    }
    topRow.appendChild(textNode);
  }

  if (showQuadrantBadge) {
    topRow.appendChild(createQuadrantBadge(todo));
  }

  const timeChip = document.createElement("span");
  timeChip.className = "todo-time-chip";
  timeChip.textContent = `更新 ${formatTodoMeta(todo)}`;
  timeChip.title = `创建 ${formatTodoMeta({ updated_at: todo.created_at })} / 更新 ${formatTodoMeta(todo)}`;

  if (!showQuadrantBadge && state.editingTodoId !== todo.id) {
    topRow.appendChild(timeChip);
  }

  content.appendChild(topRow);
  content.title = "双击编辑任务";
  content.addEventListener("dblclick", (event) => {
    if (state.editingTodoId === todo.id) return;
    if (shouldIgnoreEditTrigger(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    startEditingTodo(todo.id, editContext);
  });

  // ── 删除按钮 ─────────────────────────────────────────────────────────────────

  const delBtn = document.createElement("button");
  delBtn.className = "del-btn";
  delBtn.type = "button";
  delBtn.title = "删除";
  delBtn.setAttribute("aria-label", "删除任务");
  delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  delBtn.addEventListener("click", () => {
    const deletedTodo = { ...todo };
    li.classList.add("removing");
    setTimeout(() => {
      state.todos = state.todos.filter((item) => item.id !== todo.id);
      commitTodosChange("已保存");
      const toastEl = showToast("已删除", "撤销", () => {
        state.todos.unshift(deletedTodo);
        commitTodosChange("已保存");
      });
      clearTimeout(state.undoToastTimer);
      state.undoToastTimer = setTimeout(() => removeToast(toastEl), 4000);
    }, 200);
  });

  const actions = document.createElement("div");
  actions.className = "todo-actions";
  actions.append(delBtn);

  li.append(checkWrap, content, actions);
  return li;
}

// ── 四象限面板渲染 ────────────────────────────────────────────────────────────

function renderQuadrants(quadrantTodos) {
  bindQuadrantDropTargets();
  Object.values(dom.quadrantBuckets).forEach((list) => {
    if (list) list.innerHTML = "";
  });

  const groups = { do: [], plan: [], delegate: [], eliminate: [] };
  quadrantTodos.forEach((todo) => {
    groups[getQuadrantKey(todo)].push(todo);
  });

  Object.entries(groups).forEach(([key, items]) => {
    const bucket = dom.quadrantBuckets[key];
    if (!bucket) return;
    if (items.length === 0) {
      bucket.innerHTML = `<li class="quadrant-empty">暂无任务</li>`;
      return;
    }
    items.forEach((todo) => {
      bucket.appendChild(createTodoNode(todo, {
        showQuadrantBadge: false,
        draggableInQuadrants: true,
        allowInlineEdit: true,
        editContext: "quadrants",
      }));
    });
  });
}

// ── 定位 Todo ─────────────────────────────────────────────────────────────────

function revealTodo(todoId) {
  if (!todoId) return;
  const listNode = dom.todoList?.querySelector(`[data-todo-id="${todoId}"]`);
  if (listNode && state.filter !== "done") {
    scrollItemIntoView(dom.todoList, listNode);
  }

  const activeTodo = state.todos.find((item) => item.id === todoId);
  if (!activeTodo || activeTodo.done) return;
  const key = getQuadrantKey(activeTodo);
  const bucket = dom.quadrantBuckets[key];
  const wrap = dom.quadrantBucketWraps[key];
  const quadrantNode = bucket?.querySelector(`[data-todo-id="${todoId}"]`);
  if (quadrantNode) {
    scrollItemIntoView(wrap, quadrantNode);
  }
}

// ── 主渲染入口 ────────────────────────────────────────────────────────────────

export function renderTodos() {
  const scrollState = captureScrollState();
  closeQuadrantMenu();
  dom.todoList.innerHTML = "";

  const revealTodoId = state.pendingRevealTodoId;
  state.pendingRevealTodoId = "";

  const sortedTodos = sortTodos(state.todos);
  const visible = getVisibleTodos(sortedTodos);
  const active = sortedTodos.filter((todo) => !todo.done);
  const done = sortedTodos.filter((todo) => todo.done);
  const quadrantTodos = sortedTodos;

  if (dom.countBadge) {
    dom.countBadge.textContent = String(active.length);
  }
  if (dom.clearDoneBtn) {
    dom.clearDoneBtn.classList.toggle("visible", done.length > 0);
  }
  if (dom.todoSummary) {
    dom.todoSummary.textContent = sortedTodos.length > 0
      ? `进行中 ${active.length} · 已完成 ${done.length}`
      : "暂无任务";
  }
  if (dom.quadrantSummary) {
    dom.quadrantSummary.textContent = sortedTodos.length > 0
      ? `全部 ${sortedTodos.length} · 进行中 ${active.length} · 已完成 ${done.length}`
      : "全部 0";
  }

  if (visible.length === 0) {
    const emptyText = state.filter === "done" ? "暂无已完成任务" : "暂无待办事项";
    const emptyCta = state.filter !== "done"
      ? ` <button type="button" class="empty-cta">添加第一条任务</button>`
      : "";
    dom.todoList.innerHTML = `<li class="empty-hint"><i>·</i>${emptyText}${emptyCta}</li>`;
    renderQuadrants(quadrantTodos);
    restoreScrollState(scrollState);
    if (revealTodoId) {
      requestAnimationFrame(() => revealTodo(revealTodoId));
    }
    return;
  }

  const pageSize = state.todoListShowCount;
  const toRender = visible.length <= pageSize ? visible : visible.slice(0, pageSize);
  toRender.forEach((todo) => {
    dom.todoList.appendChild(createTodoNode(todo, { showQuadrantBadge: true }));
  });

  if (visible.length > pageSize) {
    const remaining = visible.length - pageSize;
    const loadMoreLi = document.createElement("li");
    loadMoreLi.className = "load-more-wrap";
    const loadMoreBtn = document.createElement("button");
    loadMoreBtn.type = "button";
    loadMoreBtn.className = "load-more-btn";
    loadMoreBtn.textContent = `加载更多（剩余 ${remaining} 条）`;
    loadMoreBtn.addEventListener("click", () => {
      state.todoListShowCount += TODOS_PAGE_SIZE;
      renderTodos();
    });
    loadMoreLi.appendChild(loadMoreBtn);
    dom.todoList.appendChild(loadMoreLi);
  }

  renderQuadrants(quadrantTodos);
  restoreScrollState(scrollState);
  if (revealTodoId) {
    requestAnimationFrame(() => revealTodo(revealTodoId));
  }
}
