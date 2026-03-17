import { MOBILE_TAB_KEY, MOBILE_TASKS_VIEW_KEY } from "../core/config.js";
import { state } from "../core/state.js";
import {
  loadMobileTabPreference,
  loadMobileTasksViewPreference,
  normalizeMobileTab,
  normalizeMobileTasksView,
} from "../core/storage.js";
import { dom } from "../ui/dom.js";

function isMobileViewport() {
  return window.matchMedia("(max-width: 899px)").matches;
}

function updateTabUi() {
  if (!dom.mobileTabBar) return;
  dom.mobileTabBar.querySelectorAll(".mobile-tab").forEach((tab) => {
    const isActive = tab.dataset.tab === state.mobileTab;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function updateTasksViewUi() {
  if (!dom.mobileMatrixToggle) return;
  const isMatrix = state.mobileTasksView === "matrix";
  dom.mobileMatrixToggle.classList.toggle("active", isMatrix);
  dom.mobileMatrixToggle.textContent = isMatrix ? "返回列表" : "矩阵视图";
  dom.mobileMatrixToggle.setAttribute("aria-pressed", String(isMatrix));
}

function applyDesktopView() {
  document.body.classList.remove("is-mobile");
  document.body.dataset.mobileTab = "";
  document.body.dataset.mobileTasksView = "";

  dom.sidebar?.classList.remove("hidden");
  dom.main?.classList.remove("hidden");

  dom.editorFrame?.classList.toggle("hidden", state.mainView !== "editor");
  dom.quadrantFrame?.classList.toggle("hidden", state.mainView !== "quadrants");
}

function applyMobileView() {
  document.body.classList.add("is-mobile");
  document.body.dataset.mobileTab = state.mobileTab;
  document.body.dataset.mobileTasksView = state.mobileTasksView;

  if (state.mobileTab === "edit") {
    dom.sidebar?.classList.remove("hidden");
    dom.main?.classList.remove("hidden");
    dom.editorFrame?.classList.remove("hidden");
    dom.quadrantFrame?.classList.add("hidden");
    return;
  }

  if (state.mobileTasksView === "matrix") {
    dom.sidebar?.classList.remove("hidden");
    dom.main?.classList.remove("hidden");
    dom.editorFrame?.classList.add("hidden");
    dom.quadrantFrame?.classList.remove("hidden");
    return;
  }

  dom.sidebar?.classList.remove("hidden");
  dom.main?.classList.add("hidden");
  dom.editorFrame?.classList.add("hidden");
  dom.quadrantFrame?.classList.add("hidden");
}

function persistValue(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (error) {
    console.warn("mobile navigation preference not persisted", error);
  }
}

export function setMobileTab(nextTab, persist = true) {
  state.mobileTab = normalizeMobileTab(nextTab);
  updateTabUi();
  if (persist) {
    persistValue(MOBILE_TAB_KEY, state.mobileTab);
  }
  if (state.isMobile) {
    applyMobileView();
  }
}

export function setMobileTasksView(nextView, persist = true) {
  state.mobileTasksView = normalizeMobileTasksView(nextView);
  updateTasksViewUi();
  if (persist) {
    persistValue(MOBILE_TASKS_VIEW_KEY, state.mobileTasksView);
  }
  if (state.isMobile && state.mobileTab === "tasks") {
    applyMobileView();
  }
}

export function syncNavigationMode() {
  const nextIsMobile = isMobileViewport();
  const changed = nextIsMobile !== state.isMobile;
  state.isMobile = nextIsMobile;

  if (state.isMobile) {
    if (changed) {
      state.mobileTab = loadMobileTabPreference();
      state.mobileTasksView = loadMobileTasksViewPreference();
    }
    updateTabUi();
    updateTasksViewUi();
    applyMobileView();
    return;
  }

  if (changed) {
    applyDesktopView();
    return;
  }

  applyDesktopView();
}

export function initMobileNavigation() {
  state.mobileTab = loadMobileTabPreference();
  state.mobileTasksView = loadMobileTasksViewPreference();

  if (dom.mobileTabBar) {
    dom.mobileTabBar.addEventListener("click", (event) => {
      const tab = event.target.closest(".mobile-tab");
      if (tab) {
        setMobileTab(tab.dataset.tab);
      }
    });
  }

  if (dom.mobileMatrixToggle) {
    dom.mobileMatrixToggle.addEventListener("click", () => {
      const nextView = state.mobileTasksView === "matrix" ? "list" : "matrix";
      setMobileTasksView(nextView);
    });
  }

  window.addEventListener("resize", syncNavigationMode);
  syncNavigationMode();
}
