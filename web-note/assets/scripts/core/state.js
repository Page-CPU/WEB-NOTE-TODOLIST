import { TODOS_PAGE_SIZE } from "./config.js";

// 集中管理所有可变运行时状态，替代原 app.js 中散布的顶层 let 变量。
// 各模块通过 import { state } 读写，不得在模块外直接声明同名变量。
export const state = {
  todos: [],
  filter: "active",
  mainView: "editor",

  // 保存相关
  saveStatusTimer: null,
  saveDebounceTimer: null,
  saveInFlight: false,
  saveQueued: false,
  queuedStatusText: "已保存",
  lastSavedHash: "",
  serverHash: null,
  lastErrorType: null,

  // Todo 交互
  selectedQuadrant: "eliminate",
  highlightedTodoId: "",
  highlightTodoTimer: null,
  activeQuadrantMenu: null,
  editingTodoId: "",
  draggedTodoId: "",
  pendingRevealTodoId: "",
  undoToastTimer: null,
  todoListShowCount: TODOS_PAGE_SIZE,

  // Mobile navigation (only active on < 900px)
  mobileTab: "edit", // "edit" | "tasks"
  mobileTasksView: "list", // "list" | "matrix"
  isMobile: false,
};
