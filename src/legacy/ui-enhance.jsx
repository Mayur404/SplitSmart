/**
 * SplitSmart — ui-enhance.jsx
 * Two small, self-contained UI layers that sit on top of the existing imperative views:
 *
 * 1. Dropdowns — every native <select> is progressively enhanced with a themed, accessible listbox.
 *    The native <select> stays in the DOM (visually hidden) and remains the single source of truth:
 *    choosing an option sets select.value and dispatches a bubbling `change` event, so all existing
 *    handlers and data logic keep working untouched. Views re-render via innerHTML, so a
 *    MutationObserver enhances new selects as they appear.
 *
 * 2. Receipt scanner upload — file preview, replace/remove, and drag-and-drop for #receipt-upload,
 *    plus a tiny state helper (idle → ready → scanning → error | done) used by the scan handler.
 */

const $ = (s, r = document) => r.querySelector(s);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>';

let uid = 0;
let openDd = null;           // the one open dropdown at a time

/* ==========================================================================
   1. DROPDOWNS
   ========================================================================== */
function labelFor(select) {
  const aria = select.getAttribute('aria-label');
  if (aria) return aria;
  const label = select.closest('label');
  if (label) {
    const own = [...label.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (own) return own;
  }
  return '';
}

function enhance(select) {
  if (select.dataset.sx || select.multiple || select.hasAttribute('data-native')) return;
  select.dataset.sx = '1';
  const id = `sx-${++uid}`;

  const root = document.createElement('span');
  root.className = 'sx';
  if (select.style.maxWidth) root.style.maxWidth = select.style.maxWidth;
  root.innerHTML = `<button type="button" class="sx-btn" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-list">
      <span class="sx-val"></span><span class="sx-chev">${CHEVRON}</span></button>`;
  const btn = root.firstElementChild;
  const val = btn.querySelector('.sx-val');
  const name = labelFor(select);
  if (name) btn.setAttribute('aria-label', name);

  select.classList.add('sx-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(root);                 // sibling, not a wrapper: never re-parents framework-owned nodes

  let list = null, active = -1, typed = '', typedTimer = 0;
  const opts = () => [...select.options];

  function paint() {
    const o = select.options[select.selectedIndex];
    val.textContent = o ? o.textContent.trim() : '';
    val.classList.toggle('is-placeholder', !o || o.value === '');
    btn.disabled = select.disabled;
    if (name) btn.setAttribute('aria-label', `${name}: ${val.textContent}`);
  }

  // Keep the display in sync when app code assigns select.value programmatically.
  Object.defineProperty(select, 'value', {
    configurable: true,
    get() { return valueDescriptor.get.call(this); },
    set(v) { valueDescriptor.set.call(this, v); paint(); }
  });
  select.addEventListener('change', paint);
  select.addEventListener('focus', () => btn.focus());        // label clicks land on the visible control
  select.form?.addEventListener('reset', () => setTimeout(paint));
  new MutationObserver(paint).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });

  /* ----- popup ----- */
  function place() {
    if (!list) return;
    const r = btn.getBoundingClientRect();
    const gap = 6, vh = window.innerHeight;
    const below = vh - r.bottom - 12, above = r.top - 12;
    const flip = below < 200 && above > below;
    const max = Math.max(120, Math.min(280, flip ? above - gap : below - gap));
    list.style.minWidth = `${r.width}px`;
    list.style.maxHeight = `${max}px`;
    list.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 180) - 8))}px`;
    list.style.top = flip ? '' : `${r.bottom + gap}px`;
    list.style.bottom = flip ? `${vh - r.top + gap}px` : '';
    list.dataset.flip = flip ? '1' : '0';
  }

  function setActive(i, scroll = true) {
    const items = [...list.children];
    if (active >= 0) items[active]?.classList.remove('is-active');
    active = i;
    const el = items[i];
    if (!el) { btn.removeAttribute('aria-activedescendant'); return; }
    el.classList.add('is-active');
    btn.setAttribute('aria-activedescendant', el.id);
    if (scroll) el.scrollIntoView({ block: 'nearest' });
  }

  const enabled = (i) => opts()[i] && !opts()[i].disabled;
  function step(dir, from = active) {
    const n = opts().length; if (!n) return -1;
    let i = from;
    for (let k = 0; k < n; k++) { i = (i + dir + n) % n; if (enabled(i)) return i; }
    return -1;
  }

  function choose(i) {
    const o = opts()[i];
    if (!o || o.disabled) return;
    const changed = select.selectedIndex !== i;
    select.selectedIndex = i; paint();
    close(true);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function open() {
    if (select.disabled || list) return;
    openDd?.close(false);
    list = document.createElement('ul');
    list.className = 'sx-list'; list.id = `${id}-list`; list.setAttribute('role', 'listbox');
    if (name) list.setAttribute('aria-label', name);
    opts().forEach((o, i) => {
      const li = document.createElement('li');
      li.className = 'sx-opt'; li.id = `${id}-o${i}`; li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === select.selectedIndex));
      if (o.disabled) { li.setAttribute('aria-disabled', 'true'); li.classList.add('is-disabled'); }
      if (i === select.selectedIndex) li.classList.add('is-selected');
      li.innerHTML = `<span class="sx-opt-t"></span><span class="sx-tick">${TICK}</span>`;
      li.firstChild.textContent = o.textContent.trim();
      li.addEventListener('pointerdown', e => e.preventDefault());        // keep focus on the trigger
      li.addEventListener('click', () => choose(i));
      li.addEventListener('pointermove', () => { if (!o.disabled && active !== i) setActive(i, false); });
      list.appendChild(li);
    });
    // Inside an open <dialog> the top layer would hide a body-level popup, so mount there instead.
    // Mount inside an open <dialog> (a modal makes everything outside it inert) and promote to the top layer
    // with the Popover API, so the list is positioned against the viewport and is never clipped by the dialog.
    list.setAttribute('popover', 'manual');
    (btn.closest('dialog[open]') || document.body).appendChild(list);
    try { list.showPopover?.(); } catch { /* unsupported: falls back to position: fixed */ }
    btn.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    place();
    setActive(enabled(select.selectedIndex) ? select.selectedIndex : step(1, -1));
    requestAnimationFrame(() => list?.classList.add('is-in'));
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    openDd = { close };
  }

  function close(refocus = true) {
    if (!list) return;
    const l = list; list = null; active = -1;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', onScroll, true);
    btn.setAttribute('aria-expanded', 'false'); btn.removeAttribute('aria-activedescendant');
    root.classList.remove('is-open');
    l.classList.remove('is-in');
    if (reduced.matches) l.remove(); else setTimeout(() => l.remove(), 140);
    if (openDd?.close === close) openDd = null;
    if (refocus) btn.focus({ preventScroll: true });
  }

  const onOutside = e => { if (!root.contains(e.target) && !list?.contains(e.target)) close(false); };
  const onScroll = e => { if (list && !list.contains(e.target)) place(); };

  btn.addEventListener('click', () => (list ? close(true) : open()));
  btn.addEventListener('keydown', e => {
    const isOpen = !!list;
    switch (e.key) {
      case 'ArrowDown': case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) open(); else setActive(step(e.key === 'ArrowDown' ? 1 : -1));
        break;
      case 'Home': if (isOpen) { e.preventDefault(); setActive(step(1, -1)); } break;
      case 'End': if (isOpen) { e.preventDefault(); setActive(step(-1, 0)); } break;
      case 'Enter': case ' ':
        if (e.key === ' ' && typed) { e.preventDefault(); typeAhead(' '); break; }   // mid-search space, e.g. "person 4"
        e.preventDefault();
        if (!isOpen) open(); else if (active >= 0) choose(active);
        break;
      case 'Escape': if (isOpen) { e.preventDefault(); e.stopPropagation(); close(true); } break;
      case 'Tab': if (isOpen) close(false); break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key);
    }
  });

  function typeAhead(ch) {
    typed += ch.toLowerCase(); clearTimeout(typedTimer); typedTimer = setTimeout(() => { typed = ''; }, 700);
    const all = opts();
    const start = Math.max(active, select.selectedIndex, 0);
    const hit = [...all.keys()].map(k => (start + k + (typed.length > 1 ? 0 : 1)) % all.length)
      .find(k => !all[k].disabled && all[k].textContent.trim().toLowerCase().startsWith(typed));
    if (hit !== undefined) { if (!list) open(); setActive(hit); }
  }

  paint();
}

function scanSelects(root = document) {
  root.querySelectorAll?.('select:not([data-sx])').forEach(enhance);
}
let scanQueued = false;
function queueScan() {
  if (scanQueued) return; scanQueued = true;
  requestAnimationFrame(() => { scanQueued = false; scanSelects(); });
}
scanSelects();
new MutationObserver(queueScan).observe(document.body, { childList: true, subtree: true });

/* ==========================================================================
   2. RECEIPT SCANNER UPLOAD
   ========================================================================== */
const MAX_FILE_MB = 15;
let previewUrl = '';
const fmtSize = b => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** idle | ready | scanning | error | done — drives every visual state in CSS via [data-state]. */
export function setScanState(state, label) {
  const box = $('#receipt-scanner');
  if (!box) return;
  box.dataset.state = state;
  const l = $('#scan-label');
  if (l) l.textContent = label || ({ scanning: 'Scanning…', error: 'Try again', done: 'Scan another receipt' }[state] || 'Scan receipt');
}

function isReceiptImageFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return mime.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif)$/i.test(name);
}

function showFile(file) {
  const card = $('#sc-file');
  if (!card) return;
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = ''; }
  if (!file) { card.hidden = true; setScanState('idle'); return; }
  if (!isReceiptImageFile(file)) { clearInput(); setStatusNote('Please choose an image file (JPG, PNG, WEBP or HEIC).', true); return; }
  if (file.size > MAX_FILE_MB * 1048576) { clearInput(); setStatusNote(`That image is over ${MAX_FILE_MB} MB. Choose a smaller photo.`, true); return; }
  previewUrl = URL.createObjectURL(file);
  const img = $('#sc-thumb');
  img.hidden = false; img.src = previewUrl;
  img.onerror = () => { img.hidden = true; };           // e.g. HEIC the browser cannot draw: keep the filename card
  $('#sc-name').textContent = file.name || 'Receipt photo';
  $('#sc-size').textContent = fmtSize(file.size);
  card.hidden = false;
  $('#scan-status').textContent = '';
  setScanState('ready');
}
function clearInput() { const i = $('#receipt-upload'); if (i) i.value = ''; showFile(null); }
function setStatusNote(msg, isError) {
  const s = $('#scan-status'); if (!s) return;
  s.innerHTML = '';
  const d = document.createElement('div'); d.className = isError ? 'sc-note is-error' : 'sc-note'; d.textContent = msg; s.appendChild(d);
}

document.addEventListener('change', e => {
  if (e.target.id === 'receipt-upload') showFile(e.target.files?.[0] || null);
});
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-sc]'); if (!b) return;
  if (b.dataset.sc === 'remove') clearInput();
  if (b.dataset.sc === 'replace') $('#receipt-upload')?.click();
});
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, e => {
  const z = e.target.closest?.('#sc-drop'); if (!z) return;
  e.preventDefault(); z.classList.add('is-over');
}));
document.addEventListener('dragleave', e => {
  const z = e.target.closest?.('#sc-drop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over');
});
document.addEventListener('drop', e => {
  const z = e.target.closest?.('#sc-drop'); if (!z) return;
  e.preventDefault(); z.classList.remove('is-over');
  const file = [...(e.dataTransfer?.files || [])].find(isReceiptImageFile);
  const input = $('#receipt-upload');
  if (!input) return;
  if (!file) { setStatusNote('Please drop an image file (JPG, PNG, WEBP or HEIC).', true); return; }
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    showFile(file);
  } catch {
    setStatusNote('This browser could not attach the dropped file. Use “browse files” instead.', true);
  }
});
// A page-level drop outside the zone must not navigate the tab to the image.
['dragover', 'drop'].forEach(t => window.addEventListener(t, e => { if (e.dataTransfer?.types?.includes('Files') && !e.target.closest?.('#sc-drop')) e.preventDefault(); }));
