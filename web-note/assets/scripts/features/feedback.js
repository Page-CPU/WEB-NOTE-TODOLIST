import { FEEDBACK_API, PAGE_ID } from "../core/config.js";
import { state } from "../core/state.js";
import { sanitizeTodos } from "./todos.js";
import { dom, showToast, removeToast } from "../ui/dom.js";

let lastFocusedElement = null;
let isSubmitting = false;

function pageLabel() {
  return PAGE_ID ? `/${PAGE_ID}` : "/";
}

function isFeedbackOpen() {
  return Boolean(dom.feedbackModal && !dom.feedbackModal.classList.contains("hidden"));
}

function updateFeedbackPageMeta() {
  if (!dom.feedbackPageMeta) return;
  dom.feedbackPageMeta.textContent = `当前页面 ${pageLabel()} · 默认附带浏览器与保存状态`;
}

function setFeedbackSubmitting(nextSubmitting) {
  isSubmitting = nextSubmitting;
  const disabled = Boolean(nextSubmitting);

  dom.feedbackSubmitBtn?.toggleAttribute("disabled", disabled);
  dom.feedbackCancelBtn?.toggleAttribute("disabled", disabled);
  dom.feedbackCloseBtn?.toggleAttribute("disabled", disabled);
  if (dom.feedbackType) dom.feedbackType.disabled = disabled;
  if (dom.feedbackMessage) dom.feedbackMessage.disabled = disabled;
  if (dom.feedbackContact) dom.feedbackContact.disabled = disabled;
  if (dom.feedbackIncludeDebug) dom.feedbackIncludeDebug.disabled = disabled;
  if (dom.feedbackIncludeContent) dom.feedbackIncludeContent.disabled = disabled;
  if (dom.feedbackSubmitBtn) {
    dom.feedbackSubmitBtn.textContent = disabled ? "发送中..." : "发送反馈";
  }
}

function resetFeedbackForm() {
  dom.feedbackForm?.reset();
  if (dom.feedbackIncludeDebug) dom.feedbackIncludeDebug.checked = true;
  if (dom.feedbackType) dom.feedbackType.value = "bug";
}

function closeFeedbackModal({ reset = false, force = false } = {}) {
  if (!dom.feedbackModal || (isSubmitting && !force)) return;

  dom.feedbackModal.classList.add("hidden");
  document.body.classList.remove("feedback-modal-open");

  if (reset) resetFeedbackForm();

  const restoreTarget = lastFocusedElement;
  lastFocusedElement = null;
  restoreTarget?.focus?.();
}

function openFeedbackModal() {
  if (!dom.feedbackModal || isSubmitting) return;

  lastFocusedElement = document.activeElement;
  updateFeedbackPageMeta();
  dom.feedbackModal.classList.remove("hidden");
  document.body.classList.add("feedback-modal-open");

  requestAnimationFrame(() => dom.feedbackMessage?.focus());
}

function buildFeedbackPayload() {
  const includeDebug = Boolean(dom.feedbackIncludeDebug?.checked);
  const includeContent = Boolean(dom.feedbackIncludeContent?.checked);
  const todos = sanitizeTodos(state.todos);

  return {
    type: dom.feedbackType?.value || "bug",
    message: dom.feedbackMessage?.value?.trim() || "",
    contact: dom.feedbackContact?.value?.trim() || "",
    include_debug: includeDebug,
    include_content: includeContent,
    page_id: PAGE_ID,
    url: window.location.href,
    client_time: new Date().toISOString(),
    context: includeDebug ? {
      user_agent: navigator.userAgent,
      language: navigator.language || "",
      platform: navigator.userAgentData?.platform || navigator.platform || "",
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      todo_total: todos.length,
      todo_done: todos.filter((todo) => todo.done).length,
      note_length: dom.noteArea?.value?.length ?? 0,
      save_status: dom.saveLabel?.textContent?.trim() || "",
    } : null,
    snapshot: includeContent ? {
      note: dom.noteArea?.value ?? "",
      todos,
    } : null,
  };
}

async function extractFeedbackError(response) {
  try {
    const data = await response.json();
    if (data && typeof data.detail === "string" && data.detail.trim() !== "") {
      return data.detail.trim();
    }
  } catch {}

  return `提交失败（HTTP ${response.status}）`;
}

function mailStatusMessage(status) {
  if (status === "failed") return "反馈已记录，但邮件发送失败，请稍后重试";
  if (status === "skipped") return "反馈已记录，但邮件服务尚未配置完成";
  return "";
}

async function submitFeedback(event) {
  event.preventDefault();
  if (isSubmitting) return;

  const payload = buildFeedbackPayload();
  if (!payload.message) {
    const toastEl = showToast("请先填写反馈内容");
    setTimeout(() => removeToast(toastEl), 2200);
    dom.feedbackMessage?.focus();
    return;
  }

  setFeedbackSubmitting(true);

  try {
    const response = await fetch(FEEDBACK_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await extractFeedbackError(response));
    }

    const result = await response.json();
    const mailMessage = mailStatusMessage(result?.mail_status);

    setFeedbackSubmitting(false);
    resetFeedbackForm();
    closeFeedbackModal({ force: true });

    const toastEl = showToast(mailMessage || "反馈已收到，我们会尽快查看");
    setTimeout(() => removeToast(toastEl), mailMessage ? 3600 : 2600);
  } catch (error) {
    const toastEl = showToast(error?.message || "反馈发送失败，请稍后再试");
    setTimeout(() => removeToast(toastEl), 3200);
  } finally {
    if (isSubmitting) setFeedbackSubmitting(false);
  }
}

export function initFeedback() {
  if (!dom.feedbackBtn || !dom.feedbackModal || !dom.feedbackForm) return;

  updateFeedbackPageMeta();
  resetFeedbackForm();

  dom.feedbackBtn.addEventListener("click", openFeedbackModal);
  dom.feedbackCloseBtn?.addEventListener("click", () => closeFeedbackModal());
  dom.feedbackCancelBtn?.addEventListener("click", () => closeFeedbackModal());
  dom.feedbackModal.addEventListener("click", (event) => {
    if (event.target === dom.feedbackModal) closeFeedbackModal();
  });
  dom.feedbackForm.addEventListener("submit", submitFeedback);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isFeedbackOpen()) {
      event.preventDefault();
      closeFeedbackModal();
    }
  });
}
