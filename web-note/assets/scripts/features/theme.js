import { THEME_KEY } from "../core/config.js";
import { getThemePreference } from "../core/storage.js";
import { dom } from "../ui/dom.js";

export function setTheme(nextTheme, persist = true) {
  const theme = nextTheme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (persist) {
    try { window.localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }
  if (dom.themeToggleBtn) {
    dom.themeToggleBtn.textContent = theme === "dark" ? "浅色" : "暗色";
  }
  return theme;
}

export function applyThemeFromPreference() {
  setTheme(getThemePreference(), false);
}
