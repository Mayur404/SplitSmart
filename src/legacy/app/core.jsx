/** Shared DOM and safe-text helpers for the compatibility workflow layer. */
export const selectOne = (selector, root = document) => root.querySelector(selector);
export const selectAll = (selector, root = document) => root.querySelectorAll(selector);

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>\"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '\"': '&quot;',
    "'": '&#39;',
  })[character]);
}
