/** Typed custom-event helper for shell-to-controller communication. */
export function emitSplitSmartEvent(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}
