import { 
  EDITOR_DENSITY_KEY, 
  MAIN_VIEW_KEY, 
  TODO_FILTER_KEY, 
  THEME_KEY,
  MOBILE_TAB_KEY,
  MOBILE_TASKS_VIEW_KEY,
} from "./config.js";

// ── 编辑器密度 ────────────────────────────────────────────────────────────────

export function normalizeEditorDensity(value) {
  return value === "compact" ? "compact" : "standard";
}

export function loadEditorDensityPreference() {
  try {
    return normalizeEditorDensity(window.localStorage.getItem(EDITOR_DENSITY_KEY));
  } catch {
    return "standard";
  }
}

// ── 主视图 ────────────────────────────────────────────────────────────────────

export function normalizeMainView(value) {
  return value === "quadrants" ? "quadrants" : "editor";
}

export function loadMainViewPreference() {
  try {
    return normalizeMainView(window.localStorage.getItem(MAIN_VIEW_KEY));
  } catch {
    return "editor";
  }
}

// ── 任务筛选 ──────────────────────────────────────────────────────────────────

export function normalizeFilter(value) {
  return value === "done" || value === "all" ? value : "active";
}

export function loadFilterPreference() {
  try {
    return normalizeFilter(window.localStorage.getItem(TODO_FILTER_KEY));
  } catch {
    return "active";
  }
}

// ── 主题 ──────────────────────────────────────────────────────────────────────

export function getThemePreference() {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "dark" || v === "light") return v;
  } catch (e) {}
  return "light";
}

// ── 移动端 Tab ────────────────────────────────────────────────────────────────

export function normalizeMobileTab(value) {
  return value === "tasks" ? "tasks" : "edit";
}

export function loadMobileTabPreference() {
  try {
    return normalizeMobileTab(window.localStorage.getItem(MOBILE_TAB_KEY));
  } catch {
    return "edit";
  }
}

// ── 移动端任务页视图 ──────────────────────────────────────────────────────────

export function normalizeMobileTasksView(value) {
  return value === "matrix" ? "matrix" : "list";
}

export function loadMobileTasksViewPreference() {
  try {
    return normalizeMobileTasksView(window.localStorage.getItem(MOBILE_TASKS_VIEW_KEY));
  } catch {
    return "list";
  }
}
