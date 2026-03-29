// 自定义日期选择弹层，替代浏览器原生 date input。
// 支持键盘导航（方向键、Home/End）、焦点管理、focus trap。

import { state } from "../core/state.js";
import { dom } from "../ui/dom.js";
import { syncDueDateButton } from "./todos.js";

let popoverEl = null;
let gridEl = null;
let titleEl = null;
let viewYear = 0;
let viewMonth = 0; // 0-based
let focusedDateStr = ""; // 当前键盘聚焦的日期

// ── 日期工具 ─────────────────────────────────────────────────────────────────

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function parseDateStr(str) {
  const d = new Date(str + "T00:00:00");
  return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() };
}

function getTodayStr() {
  const now = new Date();
  return toDateStr(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(dateStr, offset) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + offset);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 返回 dateStr 所在周的周日（本周起始） */
function weekStart(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 返回 dateStr 所在周的周六（本周末尾） */
function weekEnd(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + (6 - d.getDay()));
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

// ── 渲染日历网格（DOM API，避免 innerHTML） ─────────────────────────────────

function renderGrid(focusTarget) {
  if (!gridEl || !titleEl) return;

  titleEl.textContent = `${viewYear}年${viewMonth + 1}月`;

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = getTodayStr();
  const selectedStr = state.selectedDueDate || "";

  gridEl.replaceChildren();

  // 前置空格
  for (let i = 0; i < firstDayOfWeek; i++) {
    const span = document.createElement("span");
    span.className = "dp-cell dp-empty";
    gridEl.appendChild(span);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(viewYear, viewMonth, d);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dp-cell dp-day";
    btn.dataset.date = dateStr;
    btn.textContent = d;
    btn.tabIndex = -1; // 网格内用 roving tabindex，默认全部 -1

    if (dateStr === todayStr) btn.classList.add("dp-today");
    if (dateStr === selectedStr) btn.classList.add("dp-selected");

    gridEl.appendChild(btn);
  }

  // 设置焦点目标的 tabIndex 为 0（roving tabindex 模式）
  const target = focusTarget || selectedStr || todayStr || toDateStr(viewYear, viewMonth, 1);
  focusedDateStr = target;
  const focusBtn = gridEl.querySelector(`[data-date="${target}"]`);
  if (focusBtn) focusBtn.tabIndex = 0;
}

// ── 焦点管理 ─────────────────────────────────────────────────────────────────

function focusDate(dateStr) {
  if (!gridEl) return;

  const { year, month } = parseDateStr(dateStr);
  focusedDateStr = dateStr;

  if (year !== viewYear || month !== viewMonth) {
    // 跨月：重建 DOM 后延迟聚焦
    viewYear = year;
    viewMonth = month;
    renderGrid(dateStr);
    requestAnimationFrame(() => {
      const btn = gridEl.querySelector(`[data-date="${dateStr}"]`);
      if (btn) btn.focus();
    });
  } else {
    // 同月：直接更新 roving tabindex 并同步聚焦
    const prev = gridEl.querySelector('[tabindex="0"]');
    if (prev) prev.tabIndex = -1;
    const next = gridEl.querySelector(`[data-date="${dateStr}"]`);
    if (next) {
      next.tabIndex = 0;
      next.focus();
    }
  }
}

function focusInitialDate() {
  const target = state.selectedDueDate || getTodayStr();
  const { year, month } = parseDateStr(target);

  // 如果目标不在当前视图月份，renderGrid 已处理过
  if (year === viewYear && month === viewMonth) {
    focusDate(target);
  } else {
    // 目标在其他月份（不应发生，因为 open() 已对齐），兜底聚焦当月 1 号
    focusDate(toDateStr(viewYear, viewMonth, 1));
  }
}

// ── Focus trap ───────────────────────────────────────────────────────────────

function getTrapElements() {
  if (!popoverEl) return [];
  return Array.from(popoverEl.querySelectorAll(
    'button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]'
  ));
}

function onTrapTab(e) {
  if (e.key !== "Tab" || !popoverEl) return;

  const focusable = getTrapElements();
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

// ── 月份导航 ─────────────────────────────────────────────────────────────────

function prevMonth() {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderGrid();
}

function nextMonth() {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderGrid();
}

// ── 选择日期 ─────────────────────────────────────────────────────────────────

function selectDate(dateStr) {
  state.selectedDueDate = dateStr;
  syncDueDateButton();
  close();
}

function clearDate() {
  state.selectedDueDate = "";
  syncDueDateButton();
  close();
}

function selectToday() {
  selectDate(getTodayStr());
}

// ── 打开 / 关闭 ─────────────────────────────────────────────────────────────

function open() {
  if (!popoverEl) return;

  // 定位当前视图月份到已选日期或今天
  if (state.selectedDueDate) {
    const { year, month } = parseDateStr(state.selectedDueDate);
    viewYear = year;
    viewMonth = month;
  } else {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
  }

  renderGrid();
  popoverEl.classList.remove("hidden");

  // 打开后将焦点移入日历网格
  requestAnimationFrame(() => {
    focusInitialDate();
    document.addEventListener("click", onOutsideClick, true);
    document.addEventListener("keydown", onKeydown, true);
  });
}

export function close() {
  if (!popoverEl) return;
  popoverEl.classList.add("hidden");
  document.removeEventListener("click", onOutsideClick, true);
  document.removeEventListener("keydown", onKeydown, true);

  // 回焦到触发按钮
  dom.dueDateBtn?.focus();
}

function toggle() {
  if (!popoverEl) return;
  if (popoverEl.classList.contains("hidden")) {
    open();
  } else {
    close();
  }
}

function onOutsideClick(e) {
  if (!popoverEl) return;
  const picker = popoverEl.closest(".due-date-picker");
  if (picker && picker.contains(e.target)) return;
  close();
}

function onKeydown(e) {
  if (!popoverEl || popoverEl.classList.contains("hidden")) return;

  // Focus trap: Tab 在弹层内循环
  if (e.key === "Tab") {
    onTrapTab(e);
    return;
  }

  if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    close();
    return;
  }

  // 以下键盘导航仅在焦点位于日期格子内时生效
  const active = document.activeElement;
  if (!active || !active.classList.contains("dp-day")) return;

  const currentDate = active.dataset.date;
  if (!currentDate) return;

  let targetDate = null;

  switch (e.key) {
    case "ArrowLeft":  targetDate = addDays(currentDate, -1); break;
    case "ArrowRight": targetDate = addDays(currentDate, 1);  break;
    case "ArrowUp":    targetDate = addDays(currentDate, -7); break;
    case "ArrowDown":  targetDate = addDays(currentDate, 7);  break;
    case "Home":       targetDate = weekStart(currentDate);    break;
    case "End":        targetDate = weekEnd(currentDate);      break;
    case "Enter":
    case " ":
      e.preventDefault();
      selectDate(currentDate);
      return;
    default:
      return;
  }

  if (targetDate) {
    e.preventDefault();
    focusDate(targetDate);
  }
}

// ── 初始化 ───────────────────────────────────────────────────────────────────

export function initDatePicker() {
  popoverEl = document.getElementById("date-popover");
  gridEl = document.getElementById("dp-grid");
  titleEl = document.getElementById("dp-title");

  if (!popoverEl || !dom.dueDateBtn) return;

  // 按钮点击切换弹层
  dom.dueDateBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggle();
  });

  // 月份导航
  document.getElementById("dp-prev")?.addEventListener("click", (e) => {
    e.stopPropagation();
    prevMonth();
  });
  document.getElementById("dp-next")?.addEventListener("click", (e) => {
    e.stopPropagation();
    nextMonth();
  });

  // 今天 / 清除
  document.getElementById("dp-today-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    selectToday();
  });
  document.getElementById("dp-clear-btn")?.addEventListener("click", (e) => {
    e.stopPropagation();
    clearDate();
  });

  // 日期点击（事件委托）
  gridEl?.addEventListener("click", (e) => {
    const dayBtn = e.target.closest(".dp-day");
    if (!dayBtn) return;
    e.stopPropagation();
    const dateStr = dayBtn.dataset.date;
    if (dateStr) selectDate(dateStr);
  });
}
