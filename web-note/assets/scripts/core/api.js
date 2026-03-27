import { API_BASE, PAGE_ID, SAVE_DEBOUNCE_MS, FIRST_VISIT_TOAST_KEY, TODOS_PAGE_SIZE } from "./config.js";
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
      due_date: todo.due_date ?? null,
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

async function extractApiError(response) {
  const fallback = `HTTP ${response.status}`;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = await response.json();
      if (data && typeof data.detail === "string" && data.detail.trim() !== "") {
        return `${fallback}: ${data.detail.trim()}`;
      }
    } else {
      const text = (await response.text()).trim();
      if (text) {
        return `${fallback}: ${text.slice(0, 160)}`;
      }
    }
  } catch {}

  return fallback;
}

function flashApiError(message) {
  const toastEl = showToast(message);
  setTimeout(() => removeToast(toastEl), 4200);
}

const PENDING_SAVE_KEY_PREFIX = "web-note-pending-save:";

function pendingSaveStorageKey() {
  return PAGE_ID ? `${PENDING_SAVE_KEY_PREFIX}${PAGE_ID}` : "";
}

function readPendingSaveSnapshot() {
  const key = pendingSaveStorageKey();
  if (!key) return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.hash !== "string" || !parsed.hash) return null;
    if (!parsed.payload || typeof parsed.payload !== "object") return null;

    return {
      hash: parsed.hash,
      payload: {
        note: typeof parsed.payload.note === "string" ? parsed.payload.note : "",
        todos: sanitizeTodos(parsed.payload.todos),
      },
    };
  } catch {
    return null;
  }
}

function cachePendingSaveSnapshot(payload, hash) {
  const key = pendingSaveStorageKey();
  if (!key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify({
      hash,
      payload,
      updated_at: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn("pending save snapshot not persisted", error);
  }
}

function clearPendingSaveSnapshot() {
  const key = pendingSaveStorageKey();
  if (!key) return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn("pending save snapshot not cleared", error);
  }
}

async function fetchServerSnapshot() {
  const response = await fetch(API_BASE, { cache: "no-store" });
  if (!response.ok) throw new Error(await extractApiError(response));
  return response.json();
}

function serverDataPayloadHash(data) {
  return payloadHash({
    note: typeof data.note === "string" ? data.note : "",
    todos: sanitizeTodos(data.todos),
  });
}

async function reconcilePendingBeaconSave() {
  if (!state.pendingBeaconHash) return "noop";
  if (state.beaconRevalidatePromise) return state.beaconRevalidatePromise;

  const pendingHash = state.pendingBeaconHash;

  state.beaconRevalidatePromise = (async () => {
    try {
      const data = await fetchServerSnapshot();
      state.serverHash = data.hash ?? null;

      if (serverDataPayloadHash(data) === pendingHash) {
        state.lastSavedHash = pendingHash;
        state.pendingBeaconHash = "";
        clearPendingSaveSnapshot();
        state.lastErrorType = null;
        setLastModified(data.last_modified);
        return "confirmed";
      }

      state.pendingBeaconHash = "";
      return "retry";
    } catch (error) {
      console.warn("beacon save validation failed", error);
      return "unknown";
    } finally {
      state.beaconRevalidatePromise = null;
    }
  })();

  return state.beaconRevalidatePromise;
}

// ── 加载页面数据 ──────────────────────────────────────────────────────────────

export async function loadPageData() {
  showSkeleton();
  setSaveStatus("saving", "加载中");
  try {
    const data = await fetchServerSnapshot();
    const pendingSnapshot = readPendingSaveSnapshot();

    if (pendingSnapshot && pendingSnapshot.hash !== serverDataPayloadHash(data)) {
      dom.noteArea.value = pendingSnapshot.payload.note;
      state.todos = sanitizeTodos(pendingSnapshot.payload.todos);
      updateEditorMeta();
      updateLineNumbers();
      syncFilterButtons();
      state.todoListShowCount = TODOS_PAGE_SIZE;
      hideSkeleton();
      scheduleRender();
      state.lastSavedHash = serverDataPayloadHash(data);
      state.serverHash = data.hash ?? null;
      state.pendingBeaconHash = pendingSnapshot.hash;
      setLastModified(data.last_modified);
      state.lastErrorType = null;
      setSaveStatus("saving", "正在恢复上次内容");
      const toastEl = showToast("检测到上次未确认保存的内容，已自动恢复");
      setTimeout(() => removeToast(toastEl), 3200);
      persistNow("已恢复保存");
      return;
    }

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
    state.pendingBeaconHash = "";
    clearPendingSaveSnapshot();
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
    flashApiError(error?.message || "加载失败");
    scheduleRender();
  } finally {
    hideSkeleton();
  }
}

// ── 立即保存 ──────────────────────────────────────────────────────────────────

export async function persistNow(statusText = "已保存") {
  await reconcilePendingBeaconSave();

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
    if (!response.ok) throw new Error(await extractApiError(response));

    const result = await response.json();
    state.lastSavedHash = nextHash;
    if (result.hash) {
      state.serverHash = result.hash;
    }
    state.pendingBeaconHash = "";
    clearPendingSaveSnapshot();
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
    flashApiError(error?.message || "保存失败");
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

  const body = JSON.stringify({
    ...payload,
    expected_hash: state.serverHash,
  });
  const url = `${API_BASE}/save`;
  const blob = new Blob([body], { type: "application/json" });

  // sendBeacon 只能知道“是否入队”，不能知道服务端是否真的保存成功。
  // 这里仅记录一个待确认的 hash，等页面回到前台后再校验/补存。
  state.pendingBeaconHash = nextHash;
  cachePendingSaveSnapshot(payload, nextHash);

  let queued = false;
  if (navigator.sendBeacon) {
    try {
      queued = navigator.sendBeacon(url, blob);
    } catch {}
  }

  if (queued) return;

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then(async (response) => {
    if (!response.ok) return;
    const result = await response.json();
    if (result.hash) {
      state.lastSavedHash = nextHash;
      state.serverHash = result.hash;
    }
    state.pendingBeaconHash = "";
    clearPendingSaveSnapshot();
    state.lastErrorType = null;
  }).catch(() => {});
}

export async function resumePendingSave() {
  if (!state.pendingBeaconHash) return;

  const outcome = await reconcilePendingBeaconSave();
  if (outcome === "confirmed") {
    setSaveStatus("saved", "已同步");
    return;
  }

  const payload = currentPayload();
  const nextHash = payloadHash(payload);
  if (nextHash === state.lastSavedHash) return;

  persistNow("已恢复保存");
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
