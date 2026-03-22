import { state } from "../core/state.js";
import { dom } from "../ui/dom.js";

export function formatLastModified(value) {
  if (!value) return "最后修改日期 --";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "最后修改日期 --";
  const formatted = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
  return `最后修改日期 ${formatted}`;
}

export function setLastModified(value) {
  if (!dom.lastModified) return;
  const text = formatLastModified(value);
  dom.lastModified.textContent = text;
  dom.lastModified.title = text;
}

export function markLastModifiedNow() {
  setLastModified(new Date().toISOString());
}

export function setSaveStatus(status, text) {
  if (!dom.saveIndicator || !dom.saveLabel) return;

  clearTimeout(state.saveStatusTimer);
  dom.saveIndicator.classList.remove("saved", "saving", "error", "is-retry");
  if (status === "saved" || status === "saving" || status === "error") {
    dom.saveIndicator.classList.add(status);
  }
  if (status === "error") {
    dom.saveIndicator.classList.add("is-retry");
    dom.saveIndicator.setAttribute("role", "button");
    dom.saveIndicator.setAttribute("tabindex", "0");
  } else {
    dom.saveIndicator.removeAttribute("role");
    dom.saveIndicator.removeAttribute("tabindex");
  }
  dom.saveLabel.textContent = text;

  if (status === "saved") {
    state.saveStatusTimer = setTimeout(() => {
      dom.saveIndicator.classList.remove("saved", "saving", "error");
      dom.saveLabel.textContent = "自动保存";
    }, 1400);
  }
}
