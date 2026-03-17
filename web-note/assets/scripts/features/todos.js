import {
  URGENCY_OPTIONS, IMPORTANCE_OPTIONS, QUADRANT_OPTIONS,
  TODO_FILTER_KEY, TODOS_PAGE_SIZE, NEW_TODO_HIGHLIGHT_MS,
} from "../core/config.js";
import { state } from "../core/state.js";
import { normalizeFilter } from "../core/storage.js";
import { dom } from "../ui/dom.js";
import { commitTodosChange, scheduleRender } from "../core/actions.js";

// ── 数据规范化 ────────────────────────────────────────────────────────────────

export function normalizeUrgency(value) {
  const next = String(value ?? "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(URGENCY_OPTIONS, next) ? next : "normal";
}

export function normalizeImportance(value) {
  const next = String(value ?? "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(IMPORTANCE_OPTIONS, next) ? next : "important";
}

export function normalizeQuadrant(value) {
  const next = String(value ?? "").toLowerCase().trim();
  return Object.prototype.hasOwnProperty.call(QUADRANT_OPTIONS, next) ? next : "do";
}

export function normalizeTodoTimestamp(value, fallback = "") {
  const next = String(value ?? "").trim();
  if (!next) return fallback;
  const date = new Date(next);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

// ── 元数据查询 ────────────────────────────────────────────────────────────────

export function urgencyMeta(urgency) {
  return URGENCY_OPTIONS[normalizeUrgency(urgency)];
}

export function importanceMeta(importance) {
  return IMPORTANCE_OPTIONS[normalizeImportance(importance)];
}

export function quadrantMeta(quadrant) {
  return QUADRANT_OPTIONS[normalizeQuadrant(quadrant)];
}

export function getQuadrantKey(todo) {
  const urgent = urgencyMeta(todo.urgency).urgent;
  const important = importanceMeta(todo.importance).important;
  if (important && urgent) return "do";
  if (important && !urgent) return "plan";
  if (!important && urgent) return "delegate";
  return "eliminate";
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────

export function createTodoId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function sanitizeTodos(rawTodos) {
  if (!Array.isArray(rawTodos)) return [];
  return rawTodos.map((item) => {
    const timestamp = normalizeTodoTimestamp(item?.updated_at ?? item?.created_at, new Date().toISOString());
    return {
      id: String(item?.id ?? createTodoId()),
      text: String(item?.text ?? "").trim(),
      done: Boolean(item?.done),
      urgency: normalizeUrgency(item?.urgency),
      importance: normalizeImportance(item?.importance),
      created_at: normalizeTodoTimestamp(item?.created_at, timestamp),
      updated_at: timestamp,
    };
  }).filter((item) => item.text !== "");
}

export function sortTodos(items) {
  return [...items].sort((a, b) => {
    const importanceDiff =
      Number(importanceMeta(b.importance).important) -
      Number(importanceMeta(a.importance).important);
    if (importanceDiff !== 0) return importanceDiff;

    const urgencyDiff = urgencyMeta(b.urgency).order - urgencyMeta(a.urgency).order;
    if (urgencyDiff !== 0) return urgencyDiff;

    return normalizeTodoTimestamp(b.updated_at).localeCompare(normalizeTodoTimestamp(a.updated_at));
  });
}

export function getVisibleTodos(sortedTodos) {
  if (state.filter === "all") return sortedTodos;
  if (state.filter === "done") return sortedTodos.filter((todo) => todo.done);
  return sortedTodos.filter((todo) => !todo.done);
}

export function formatTodoMeta(todo) {
  const timestamp = normalizeTodoTimestamp(todo.updated_at ?? todo.created_at);
  if (!timestamp) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function applyQuadrantToTodo(todo, quadrant) {
  const next = quadrantMeta(quadrant);
  todo.urgency = next.urgency;
  todo.importance = next.importance;
  todo.updated_at = new Date().toISOString();
}

// ── 高亮闪烁 ──────────────────────────────────────────────────────────────────

export function flashTodo(todoId, duration = NEW_TODO_HIGHLIGHT_MS) {
  state.highlightedTodoId = todoId;
  clearTimeout(state.highlightTodoTimer);
  state.highlightTodoTimer = setTimeout(() => {
    if (state.highlightedTodoId !== todoId) return;
    state.highlightedTodoId = "";
    scheduleRender();
  }, duration);
}

// ── 筛选 ──────────────────────────────────────────────────────────────────────

export function syncFilterButtons() {
  document.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === state.filter);
  });
}

export function setFilter(nextFilter, persist = true) {
  state.filter = normalizeFilter(nextFilter);
  state.todoListShowCount = TODOS_PAGE_SIZE;
  syncFilterButtons();
  if (persist) {
    try {
      window.localStorage.setItem(TODO_FILTER_KEY, state.filter);
    } catch (error) {
      console.warn("todo filter preference not persisted", error);
    }
  }
}

// ── 四象限选择器 ──────────────────────────────────────────────────────────────

export function setSelectedQuadrant(nextQuadrant) {
  state.selectedQuadrant = normalizeQuadrant(nextQuadrant);
  if (!dom.todoQuadrantPicker) return;
  dom.todoQuadrantPicker.querySelectorAll(".quadrant-chip").forEach((chip) => {
    const isActive = chip.dataset.quadrant === state.selectedQuadrant;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
}

// ── 编辑 ──────────────────────────────────────────────────────────────────────

export function startEditingTodo(todoId) {
  state.editingTodoId = todoId;
  state.pendingRevealTodoId = todoId;
  scheduleRender();
}

export function finishEditingTodo(todoId, value, commit) {
  const todo = state.todos.find((item) => item.id === todoId);
  if (!todo) {
    state.editingTodoId = "";
    state.pendingRevealTodoId = "";
    scheduleRender();
    return;
  }

  if (!commit) {
    state.editingTodoId = "";
    state.pendingRevealTodoId = todoId;
    scheduleRender();
    return;
  }

  const text = String(value ?? "").trim();
  if (!text || text === todo.text) {
    state.editingTodoId = "";
    state.pendingRevealTodoId = todoId;
    scheduleRender();
    return;
  }

  todo.text = text;
  todo.updated_at = new Date().toISOString();
  state.editingTodoId = "";
  flashTodo(todoId, 1200);
  state.pendingRevealTodoId = todoId;
  commitTodosChange("已保存");
}

// ── 新增任务 ──────────────────────────────────────────────────────────────────

export function addTodo() {
  const text = dom.todoInput.value.trim();
  if (!text) return;

  const now = new Date().toISOString();
  const nextQuadrant = quadrantMeta(state.selectedQuadrant);
  const id = createTodoId();

  state.todos.unshift({
    id,
    text,
    done: false,
    urgency: nextQuadrant.urgency,
    importance: nextQuadrant.importance,
    created_at: now,
    updated_at: now,
  });

  flashTodo(id);
  state.pendingRevealTodoId = id;
  dom.todoInput.value = "";
  dom.todoInput.focus();
  commitTodosChange("已保存");
}
