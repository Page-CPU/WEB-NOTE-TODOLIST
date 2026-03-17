// 协调层：通过依赖注入持有 renderTodos 和 queueSave 的引用。
// 打断 todos ↔ render ↔ api 之间的循环依赖。
//
// 用法：app-init.js 在启动时调用 setupActions，之后其他模块通过
// commitTodosChange() / scheduleRender() 触发渲染与保存，
// 无需直接依赖 ui/render.js 或 core/api.js。

import { markLastModifiedNow } from "../features/save-status.js";

let _renderTodos = null;
let _queueSave = null;

/**
 * 由 app-init.js 在所有模块加载后调用一次。
 */
export function setupActions({ renderTodos, queueSave }) {
  _renderTodos = renderTodos;
  _queueSave = queueSave;
}

/**
 * 状态变更后的标准提交：重新渲染 + 标记修改时间 + 排队保存。
 */
export function commitTodosChange(statusText = "已保存") {
  _renderTodos?.();
  markLastModifiedNow();
  _queueSave?.(statusText);
}

/**
 * 仅需重新渲染、不触发保存的场景（如高亮动画结束、进入编辑态）。
 */
export function scheduleRender() {
  _renderTodos?.();
}
