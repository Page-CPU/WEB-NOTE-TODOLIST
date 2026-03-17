import { EDITOR_DENSITY_KEY, MAIN_VIEW_KEY } from "../core/config.js";
import { state } from "../core/state.js";
import { normalizeEditorDensity, normalizeMainView } from "../core/storage.js";
import { dom } from "../ui/dom.js";
import { markdownToHtml } from "./markdown.js";

// ── 编辑器密度 ────────────────────────────────────────────────────────────────

export function setEditorDensity(nextDensity, persist = true) {
  const density = normalizeEditorDensity(nextDensity);
  document.body.dataset.editorDensity = density;

  if (dom.densityToggle) {
    dom.densityToggle.querySelectorAll(".density-chip").forEach((chip) => {
      const isActive = chip.dataset.density === density;
      chip.classList.toggle("active", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
  }

  if (persist) {
    try {
      window.localStorage.setItem(EDITOR_DENSITY_KEY, density);
    } catch (error) {
      console.warn("density preference not persisted", error);
    }
  }
}

// ── 主视图切换 ────────────────────────────────────────────────────────────────

export function setMainView(nextView, persist = true) {
  state.mainView = normalizeMainView(nextView);
  document.body.dataset.mainView = state.mainView;

  if (persist) {
    try {
      window.localStorage.setItem(MAIN_VIEW_KEY, state.mainView);
    } catch (error) {
      console.warn("main view preference not persisted", error);
    }
  }

  dom.editorFrame?.classList.toggle("hidden", state.mainView !== "editor");
  dom.quadrantFrame?.classList.toggle("hidden", state.mainView !== "quadrants");

  if (dom.openQuadrantsBtn) {
    dom.openQuadrantsBtn.classList.toggle("active", state.mainView === "quadrants");
    dom.openQuadrantsBtn.setAttribute("aria-pressed", String(state.mainView === "quadrants"));
  }
}

// ── 编辑器内容元信息 ──────────────────────────────────────────────────────────

export function updateLineNumbers() {
  if (!dom.editorLineNumbers || !dom.noteArea) return;
  const lines = dom.noteArea.value ? dom.noteArea.value.split("\n") : [""];
  const n = lines.length;
  dom.editorLineNumbers.textContent = n > 0
    ? Array.from({ length: n }, (_, i) => i + 1).join("\n")
    : "1";
}

export function updateEditorMeta() {
  const value = dom.noteArea.value;
  dom.charCount.textContent = `${value.replace(/\n/g, "").length} 字`;
  dom.lineCount.textContent = `${value ? value.split("\n").length : 0} 行`;
}

export function setEditorMode(mode) {
  const isPreview = mode === "preview";
  const previewEl = document.getElementById("editor-preview");
  const areaWrap = document.querySelector(".editor-area-wrap");
  const toggleGroup = document.getElementById("preview-toggle");

  if (!previewEl || !areaWrap) return;

  if (isPreview) {
    const noteArea = document.getElementById("note-area");
    previewEl.innerHTML = markdownToHtml(noteArea?.value ?? "");
  }

  areaWrap.classList.toggle("hidden", isPreview);
  previewEl.classList.toggle("hidden", !isPreview);

  if (toggleGroup) {
    toggleGroup.querySelectorAll(".preview-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.mode === mode);
    });
  }
}
