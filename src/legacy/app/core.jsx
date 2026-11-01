/** SplitSmart — Shared state, DOM helpers, icons, toast and active-outing persistence. */
import { getRosters, getRecent, getSettings } from '../state.jsx';

export const S = {
  rosters: getRosters(),
  recent: getRecent(),
  settings: getSettings(),
  view: 'dashboard',
  lastRenderedView: null,
  activeGroup: null,
  outingSession: null,
  previousUnrolls: [], // Stack for undo unroll
  scanNotice: null,    // { count } — shown once in the scanner after a successful scan
  importedClaims: [],
  pendingAmbiguityAction: null,
  recognitionInstance: null,
  assignmentDietFilter: 'ALL',
  assignmentSearchQuery: '',
  assignActiveMemberId: '',   // the person the dish rows act on (Assign step)
  // True only when the Assign view is entered from navigation, so toggling a chip never replays the entrance.
  assignAnimate: false,
  decodedClaimPayload: null,
  gasRefreshInFlight: false
};
S.activeGroup = S.rosters[0] || null;

// DOM Selectors and Utilities
export const $ = sel => document.querySelector(sel);

export const $$ = sel => document.querySelectorAll(sel);

export const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// Small inline icon set keeps the interface dependency-free and consistent.
const ICON_PATHS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  warning: '<path d="M12 4 3.8 19h16.4L12 4Z"/><path d="M12 9v4M12 16.5h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42"/>',
  moon: '<path d="M20.5 15.2A8.5 8.5 0 0 1 8.8 3.5 8.5 8.5 0 1 0 20.5 15.2Z"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"/>',
  sparkle: '<path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  link: '<path d="M10 13.5a4 4 0 0 0 5.7.2l2-2a4 4 0 0 0-5.7-5.7l-1.1 1.1"/><path d="M14 10.5a4 4 0 0 0-5.7-.2l-2 2A4 4 0 0 0 8 18l1.1-1.1"/>',
  play: '<path d="m9 6 10 6-10 6V6Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>'
};

export const icon = (name, className = '') => {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ICON_PATHS.check}</svg>`;
};

export const ACTIVE_OUTING_KEY = 'splitsmart:active-outing';

export function persistActiveOuting() {
  if (!S.outingSession?.id || !Array.isArray(S.outingSession.bills)) return;
  try { localStorage.setItem(ACTIVE_OUTING_KEY, JSON.stringify(S.outingSession)); } catch { /* local persistence is best effort */ }
}

export function restoreActiveOuting() {
  if (S.outingSession?.bills?.length) return S.outingSession;
  try {
    const saved = JSON.parse(localStorage.getItem(ACTIVE_OUTING_KEY) || 'null');
    if (!saved?.id || !Array.isArray(saved.bills) || !saved.bills.length) return null;
    S.outingSession = saved;
    S.activeGroup = S.rosters.find(group => group.id === saved.groupId) || S.activeGroup || S.rosters[0] || null;
    return S.outingSession;
  } catch { return null; }
}

// Apply Theme
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const themeIcon = $('#theme-icon');
  if (themeIcon) themeIcon.innerHTML = theme === 'dark' ? iconSvg('sun') : iconSvg('moon');
}

export function iconSvg(name) {
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

// Toast Notification
export function toast(message, isError = false) {
  const container = $('#toast-region');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Safe Group Member Access
export function members() {
  return S.activeGroup?.members || [];
}

export function currentBill() {
  restoreActiveOuting();
  if (!S.outingSession || !S.outingSession.bills.length) return null;
  return S.outingSession.bills[0];
}
