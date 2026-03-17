import { API_BASE, SAVE_DEBOUNCE_MS, FIRST_VISIT_TOAST_KEY, TODOS_PAGE_SIZE } from "./config.js";
import { state } from "./state.js";
import {
  sanitizeTodos, normalizeTodoTimestamp, normalizeUrgency, normalizeImportance, syncFilterButtons,
} from "../features/todos.js";
import { setSaveStatus, setLastModified } from "../features/save-status.js";
import { updateEditorMeta, updateLineNumbers } from "../features/editor.js";
import { dom, showSkeleton, hideSkeleton, showToast, removeToast } from "../ui/dom.js";
import { scheduleRender } from "./actions.js";

// ── 数据摘要（用于变更检测）────────────────────────────────────────────────────

function payloadHash(payload) {
  return JSON.stringify({
    note: payload.note,
    todos: payload.todos.map((todo) => ({
      id: String(todo.id),
      text: String(todo.text),
      done: Boolean(todo.done),
      urgency: normalizeUrgency(todo.urgency),
      importance: normalizeImportance(todo.importance),
      created_at: normalizeTodoTimestamp(todo.created_at),
      updated_at: normalizeTodoTimestamp(todo.updated_at),
    })),
  });
}

function currentPayload() {
  return {
    note: dom.noteArea.value,
    todos: sanitizeTodos(state.todos),
  };
}

// ── 加载页面数据 ──────────────────────────────────────────────────────────────

export async function loadPageData() {
  showSkeleton();
  setSaveStatus("saving", "加载中");
  try {
    const response = await fetch(API_BASE, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    dom.noteArea.value = typeof data.note === "string" ? data.note : "";
    state.todos = sanitizeTodos(data.todos);
    updateEditorMeta();
    updateLineNumbers();
    syncFilterButtons();
    state.todoListShowCount = TODOS_PAGE_SIZE;
    hideSkeleton();
    scheduleRender();
    state.lastSavedHash = payloadHash(currentPayload());
    state.serverHash = data.hash ?? null;
    setLastModified(data.last_modified);
    state.lastErrorType = null;
    setSaveStatus("saved", data.exists ? "已加载" : "新页面");

    if (!data.exists) {
      try {
        if (!window.localStorage.getItem(FIRST_VISIT_TOAST_KEY)) {
          const msg = "本页会自动保存，保存此链接可随时找回";
          const toastEl = showToast(msg);
          setTimeout(() => removeToast(toastEl), 4500);
          window.localStorage.setItem(FIRST_VISIT_TOAST_KEY, "1");
        }
      } catch (e) {}
    }
  } catch (error) {
    console.error("加载失败", error);
    state.lastErrorType = "load";
    setSaveStatus("error", "加载失败，点击重试");
    scheduleRender();
  } finally {
    hideSkeleton();
  }
}

// ── 立即保存 ──────────────────────────────────────────────────────────────────

export async function persistNow(statusText = "已保存") {
  const payload = currentPayload();
  const nextHash = payloadHash(payload);
  if (nextHash === state.lastSavedHash) return;

  if (state.saveInFlight) {
    state.saveQueued = true;
    return;
  }

  state.saveInFlight = true;
  setSaveStatus("saving", "保存中");

  try {
    const response = await fetch(`${API_BASE}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        expected_hash: state.serverHash,
      }),
    });
    if (response.status === 409) {
      const conflict = await response.json();
      state.serverHash = conflict.server_hash ?? null;
      state.lastErrorType = "conflict";
      setSaveStatus("error", "内容已被其他设备修改");
      showConflictDialog(conflict, payload);
      return;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();
    state.lastSavedHash = nextHash;
    if (result.hash) {
      state.serverHash = result.hash;
    }
    if (result.reason === "empty") {
      setSaveStatus("saved", "未保存");
    } else if (result.reason === "unchanged") {
      setSaveStatus("saved", "无变化");
    } else {
      setLastModified(result.last_modified ?? new Date().toISOString());
      state.lastErrorType = null;
      setSaveStatus("saved", statusText);
    }
  } catch (error) {
    console.error("保存失败", error);
    state.lastErrorType = "save";
    setSaveStatus("error", "保存失败，点击重试");
  } finally {
    state.saveInFlight = false;
    if (state.saveQueued) {
      state.saveQueued = false;
      persistNow(state.queuedStatusText);
    }
  }
}

// ── 防抖保存 ──────────────────────────────────────────────────────────────────

export function queueSave(statusText = "已保存") {
  state.queuedStatusText = statusText;
  clearTimeout(state.saveDebounceTimer);
  state.saveDebounceTimer = setTimeout(() => {
    state.saveDebounceTimer = null;
    persistNow(state.queuedStatusText);
  }, SAVE_DEBOUNCE_MS);
}

// ── Beacon 保存（页面关闭前）─────────────────────────────────────────────────

export function saveWithBeacon() {
  const payload = currentPayload();
  const nextHash = payloadHash(payload);
  if (nextHash === state.lastSavedHash) return;

  clearTimeout(state.saveDebounceTimer);
  state.saveDebounceTimer = null;

  const body = JSON.stringify(payload);
  const url = `${API_BASE}/save`;
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
  } else {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  }
}

function showConflictDialog(conflict, localPayload) {
  document.querySelector(".conflict-dialog-backdrop")?.remove();

  const el = document.createElement("div");
  el.className = "conflict-dialog-backdrop";
  el.innerHTML = `
    <div class="conflict-dialog">
      <h3>内容冲突</h3>
      <p>此页面已被其他设备修改。请选择操作：</p>
      <div class="conflict-actions">
        <button type="button" class="conflict-btn conflict-btn-reload">加载远端内容</button>
        <button type="button" class="conflict-btn conflict-btn-overwrite">覆盖为本地内容</button>
      </div>
    </div>
  `;

  el.querySelector(".conflict-btn-reload").addEventListener("click", () => {
    el.remove();
    loadPageData();
  });

  el.querySelector(".conflict-btn-overwrite").addEventListener("click", () => {
    el.remove();
    state.serverHash = null;
    if (localPayload) {
      dom.noteArea.value = localPayload.note ?? "";
      state.todos = sanitizeTodos(localPayload.todos);
      updateEditorMeta();
      updateLineNumbers();
      scheduleRender();
    }
    persistNow("已覆盖保存");
  });

  document.body.appendChild(el);
}
