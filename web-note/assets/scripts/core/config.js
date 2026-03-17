function getPageIdFromPath() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  return segments[0] || "";
}

export const PAGE_ID = getPageIdFromPath();
export const API_BASE = `/api/pages/${encodeURIComponent(PAGE_ID)}`;

export const EDITOR_DENSITY_KEY = "web-note-editor-density";
export const MAIN_VIEW_KEY = "web-note-main-view";
export const TODO_FILTER_KEY = "web-note-todo-filter";
export const THEME_KEY = "web-note-theme";
export const FIRST_VISIT_TOAST_KEY = "web-note-first-visit-toast";

// Mobile navigation keys
export const MOBILE_TAB_KEY = "web-note-mobile-tab";
export const MOBILE_TASKS_VIEW_KEY = "web-note-mobile-tasks-view";

export const TODOS_PAGE_SIZE = 50;
export const SAVE_DEBOUNCE_MS = 400;
export const CLEAR_DONE_CONFIRM_THRESHOLD = 3;
export const NEW_TODO_HIGHLIGHT_MS = 1400;
export const TODO_COMPLETE_ANIMATION_MS = 180;

export const URGENCY_OPTIONS = {
  low:      { label: "不急",     order: 0, urgent: false },
  normal:   { label: "普通",     order: 1, urgent: false },
  high:     { label: "紧急",     order: 2, urgent: true  },
  critical: { label: "非常紧急", order: 3, urgent: true  },
};

export const IMPORTANCE_OPTIONS = {
  important:  { label: "重要", important: true  },
  supporting: { label: "支撑", important: false },
};

export const QUADRANT_OPTIONS = {
  eliminate: { label: "不急",     urgency: "low",      importance: "supporting" },
  plan:      { label: "普通",     urgency: "normal",   importance: "important"  },
  delegate:  { label: "紧急",     urgency: "high",     importance: "supporting" },
  do:        { label: "非常紧急", urgency: "critical", importance: "important"  },
};
