const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function hideBoot() {
  const el = $('#boot-loader');
  if (!el) return;
  el.classList.add('is-done');
  setTimeout(() => el.remove(), 400);
}
if (document.readyState === 'complete') requestAnimationFrame(hideBoot);
else window.addEventListener('load', () => requestAnimationFrame(hideBoot), { once: true });

function initHalo() {
  if (!finePointer.matches || reduced.matches) return;
  const halo = document.createElement('div');
  halo.className = 'cursor-halo';
  halo.setAttribute('aria-hidden', 'true');
  document.body.appendChild(halo);
  let tx = -100, ty = -100, x = tx, y = ty, raf = 0, shown = false;
  const loop = () => {
    x += (tx - x) * 0.22; y += (ty - y) * 0.22;
    halo.style.transform = `translate3d(${x - 18}px, ${y - 18}px, 0)`;
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.1 ? requestAnimationFrame(loop) : 0;
  };
  const move = (px, py) => {
    tx = px; ty = py;
    if (!shown) { shown = true; x = px; y = py; halo.classList.add('is-visible'); }
    if (!raf) raf = requestAnimationFrame(loop);
  };
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') move(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('dragover', e => { halo.classList.add('is-dragging'); move(e.clientX, e.clientY); }, { passive: true });
  document.addEventListener('dragend', () => halo.classList.remove('is-dragging'), true);
  document.addEventListener('drop', () => halo.classList.remove('is-dragging'), true);
  document.addEventListener('pointerover', e => {
    halo.classList.toggle('is-hot', !!e.target.closest?.('a, button, [data-dnd], .metric-card, [data-action], .wheel-item'));
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { shown = false; halo.classList.remove('is-visible'); });
}

const ROW = 56; 

function createWheel(wheel, track, rows, onActive) {
  const n = rows.length, max = (n - 1) * ROW;
  const fit = n * ROW <= 236; let fitActive = 0;
  wheel.classList.toggle('is-fit', fit);
  let raw = 0, vel = 0, mode = 'idle', snapTarget = 0, raf = 0, last = 0, active = -1;
  let dragging = false, moved = 0, lastY = 0, downRow = null, samples = [], snapTimer = 0;
  const rubber = p => (p < 0 ? p * 0.35 : p > max ? max + (p - max) * 0.35 : p);

  function paint() {
    if (fit) {
      track.style.transform = '';
      rows.forEach(r => { r.style.transform = ''; r.style.opacity = ''; });
      if (fitActive !== active) {
        active = fitActive;
        rows.forEach((r, i) => { r.classList.toggle('is-active', i === active); r.setAttribute('aria-selected', String(i === active)); });
        wheel.setAttribute('aria-activedescendant', rows[active].id);
        onActive?.(active);
      }
      return;
    }
    const p = rubber(raw);
    track.style.transform = `translate3d(0, ${-p}px, 0)`;
    for (let i = 0; i < n; i++) {
      const d = (i * ROW - p) / ROW, a = Math.abs(d);
      rows[i].style.transform = `perspective(600px) rotateX(${clamp(-d * 14, -34, 34)}deg) scale(${Math.max(0.72, 1 - 0.1 * a)})`;
      rows[i].style.opacity = Math.max(0.45, 1 - 0.22 * a);
    }
    const idx = clamp(Math.round(p / ROW), 0, n - 1);
    if (idx !== active) {
      active = idx;
      rows.forEach((r, i) => { r.classList.toggle('is-active', i === idx); r.setAttribute('aria-selected', String(i === idx)); });
      wheel.setAttribute('aria-activedescendant', rows[idx].id);
      onActive?.(idx);
    }
  }

  function step(t) {
    const dt = Math.min(0.032, (t - last) / 1000 || 0.016);
    last = t;
    if (mode === 'fling') {
      vel *= Math.pow(0.0245, dt);              
      raw += vel * dt;
      if (raw < 0 || raw > max || Math.abs(vel) < 140) snap();
    }
    if (mode === 'snap') {                      
      const k = 300, c = 2 * 0.78 * Math.sqrt(k);
      vel += (-k * (raw - snapTarget) - c * vel) * dt;
      raw += vel * dt;
      if (Math.abs(raw - snapTarget) < 0.3 && Math.abs(vel) < 8) { raw = snapTarget; vel = 0; mode = 'idle'; }
    }
    paint();
    raf = mode === 'idle' ? 0 : requestAnimationFrame(step);
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step); } }
  function snap(idx) {
    if (fit) { if (idx != null) fitActive = clamp(idx, 0, n - 1); paint(); return; }
    snapTarget = clamp(idx ?? Math.round(raw / ROW), 0, n - 1) * ROW;
    if (reduced.matches) { raw = snapTarget; vel = 0; mode = 'idle'; paint(); return; }
    mode = 'snap'; kick();
  }
  function stop() { mode = 'idle'; if (raf) cancelAnimationFrame(raf); raf = 0; }

  const ac = new AbortController();
  const opt = { signal: ac.signal };
  wheel.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    stop(); vel = 0; dragging = true; moved = 0; lastY = e.clientY;
    downRow = e.target.closest('.wheel-item');
    samples = [{ t: e.timeStamp, y: e.clientY }];
    wheel.setPointerCapture(e.pointerId);
  }, opt);
  wheel.addEventListener('pointermove', e => {
    if (!dragging) return;
    const dy = e.clientY - lastY; lastY = e.clientY; moved += Math.abs(dy);
    if (fit) return;
    raw = clamp(raw - dy, -ROW * 3, max + ROW * 3);
    samples.push({ t: e.timeStamp, y: e.clientY });
    while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    paint();
  }, opt);
  const release = (e, cancelled) => {
    if (!dragging) return;
    dragging = false;
    if (!cancelled && moved < 6 && downRow) { wheel.dispatchEvent(new CustomEvent('wheel-tap', { detail: rows.indexOf(downRow) })); return; }
    if (fit) return;
    const a = samples[0], b = samples[samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    vel = dt > 0 && e.timeStamp - b.t < 80 ? clamp((a.y - b.y) / dt, -4000, 4000) : 0;
    if (reduced.matches) return snap();
    if (Math.abs(vel) > 300 && raw >= 0 && raw <= max) { mode = 'fling'; kick(); } else snap();
  };
  wheel.addEventListener('pointerup', e => release(e, false), opt);
  wheel.addEventListener('pointercancel', e => release(e, true), opt);
  wheel.addEventListener('wheel', e => {            // mouse wheel / trackpad
    e.preventDefault();
    if (fit) return;
    stop(); vel = 0;
    raw = clamp(raw + e.deltaY * (e.deltaMode === 1 ? 20 : 0.9), -ROW * 0.8, max + ROW * 0.8);
    paint();
    clearTimeout(snapTimer); snapTimer = setTimeout(() => snap(), 110);
  }, { passive: false, signal: ac.signal });

  paint();
  return {
    get active() { return active; },
    goTo: i => snap(i),
    nudge(dy) { if (fit) return; stop(); vel = 0; raw = clamp(raw + dy, 0, max); paint(); },
    settle: () => snap(),
    destroy() { stop(); clearTimeout(snapTimer); ac.abort(); }
  };
}

let bubble = null;
let drag = null;
let suppressClickUntil = 0;
const SCOPE = '.assign-page, .claim-page';
const initialOf = n => (String(n).trim()[0] || '?').toUpperCase();
const membersOf = el => { try { return JSON.parse(el.dataset.members || '[]'); } catch { return []; } };
const itemEl = id => document.querySelector(`[data-dnd="item"][data-item-id="${CSS.escape(id)}"]`);
const isAssigned = r => { const it = itemEl(r.itemId); return !!it && membersOf(it).includes(r.memberId); };

function buildRows(kind, src) {
  const root = src.closest(SCOPE) || document;
  if (kind === 'items') {
    return [...root.querySelectorAll('[data-dnd="item"]')].map(el => ({
      itemId: el.dataset.itemId, memberId: src.dataset.personId, label: el.dataset.itemName, amount: el.dataset.itemAmount }));
  }
  return [...root.querySelectorAll('[data-dnd="person"]')].map(el => ({
    itemId: src.dataset.itemId, memberId: el.dataset.personId, label: el.dataset.personName, avatar: initialOf(el.dataset.personName) }));
}

const CIRCLE_R = 24, PANEL_R = 30;
const geo = (w, h, cx, cy) => ({
  circle: { top: `${cy - CIRCLE_R}px`, left: `${cx - CIRCLE_R}px`, right: `${w - cx - CIRCLE_R}px`, bottom: `${h - cy - CIRCLE_R}px`, borderRadius: `${CIRCLE_R}px` },
  full: { top: '0px', left: '0px', right: '0px', bottom: '0px', borderRadius: `${PANEL_R}px` }
});

function closePopup(restoreFocus = true) {
  if (!bubble) return;
  const b = bubble; bubble = null;
  b.wheel.destroy();
  document.removeEventListener('keydown', b.onKey, true);
  document.removeEventListener('pointerdown', b.onOutside, true);
  cancelAnimationFrame(b.loop);
  b.el.classList.add('is-closing');
  if (reduced.matches) { b.el.remove(); b.scrim.remove(); }
  else {
    b.glass.getAnimations().forEach(a => a.cancel());
    b.glass.animate([{ ...b.g.full, opacity: 1, transform: 'scale(1)' }, { ...b.g.circle, opacity: 0, transform: 'scale(.5)' }],
      { duration: 240, easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' });
    b.body.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: 110, fill: 'forwards' });
    b.scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, fill: 'forwards' });
    setTimeout(() => { b.el.remove(); b.scrim.remove(); }, 250);
  }
  if (restoreFocus && b.opener && document.contains(b.opener)) b.opener.focus({ preventScroll: true });
}

function openPopup(src, x, y, { mode = 'pick' } = {}) {
  closePopup(false);
  const kind = src.dataset.dnd === 'person' ? 'items' : 'people';
  const rows = buildRows(kind, src);
  if (!rows.length) return null;
  const inAssign = !!src.closest('.assign-page');
  const srcName = src.dataset.personName || src.dataset.itemName || '';

  const scrim = document.createElement('div');
  scrim.className = 'gp-scrim'; scrim.setAttribute('aria-hidden', 'true');
  scrim.style.setProperty('--cx', `${x}px`); scrim.style.setProperty('--cy', `${y}px`);

  const el = document.createElement('div');
  el.className = 'food-bubble';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', kind === 'items' ? `Dishes for ${srcName}` : `People for ${srcName}`);
  const glass = document.createElement('div'); glass.className = 'gp-glass'; glass.setAttribute('aria-hidden', 'true');
  const body = document.createElement('div'); body.className = 'gp-body';
  const title = document.createElement('p'); title.className = 'bubble-title';
  title.textContent = kind === 'items' ? `${srcName} ${inAssign ? 'takes' : 'claims'}…` : (inAssign ? `Who shared ${srcName}?` : `Who’s claiming ${srcName}?`);
  const wheelEl = document.createElement('div');
  wheelEl.className = 'wheel'; wheelEl.tabIndex = 0; wheelEl.setAttribute('role', 'listbox');
  wheelEl.setAttribute('aria-label', kind === 'items' ? 'Dishes' : 'People');
  const track = document.createElement('div'); track.className = 'wheel-track';

  const rowEls = rows.map((r, i) => {
    const d = document.createElement('div');
    d.className = 'wheel-item'; d.id = `wheel-opt-${i}`; d.setAttribute('role', 'option'); d.setAttribute('aria-selected', 'false');
    if (r.avatar) { const av = document.createElement('span'); av.className = 'wi-avatar'; av.textContent = r.avatar; av.setAttribute('aria-hidden', 'true'); d.appendChild(av); }
    const nm = document.createElement('span'); nm.className = 'wi-name'; nm.textContent = r.label; d.appendChild(nm);
    if (r.amount) { const am = document.createElement('span'); am.className = 'wi-amt'; am.textContent = r.amount; d.appendChild(am); }
    const tick = document.createElement('span'); tick.className = 'wi-tick'; tick.setAttribute('aria-hidden', 'true');
    tick.innerHTML = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7"/></svg>'; d.appendChild(tick);
    track.appendChild(d); return d;
  });
  wheelEl.appendChild(track);
  body.append(title, wheelEl);
  const hint = document.createElement('p'); hint.className = 'bubble-hint';
  hint.textContent = mode === 'drag' ? 'Drop on a row, or scroll and tap · Esc closes' : 'Scroll or drag · Enter or tap · Esc closes';
  body.appendChild(hint);
  el.append(glass, body);
  document.body.append(scrim, el);

  const w = el.offsetWidth, h = el.offsetHeight;
  let left, top, cx, cy;
  if (window.innerWidth < 520) {
    el.classList.add('is-sheet');
    left = (window.innerWidth - w) / 2; top = window.innerHeight - h - 12; cx = w / 2; cy = h - 40;
  } else {
    left = x + 30; if (left + w > window.innerWidth - 8) left = x - 30 - w;
    left = clamp(left, 8, window.innerWidth - w - 8);
    top = clamp(y - h / 2, 8, Math.max(8, window.innerHeight - h - 8));
    el.style.left = `${left}px`; el.style.top = `${top}px`;
    cx = clamp(x - left, CIRCLE_R + 6, w - CIRCLE_R - 6); cy = clamp(y - top, CIRCLE_R + 6, h - CIRCLE_R - 6);
  }
  const g = geo(w, h, cx, cy);

  const refresh = () => rowEls.forEach((d, i) => {
    const on = isAssigned(rows[i]);
    d.classList.toggle('is-assigned', on);
    d.setAttribute('aria-label', `${rows[i].label}${rows[i].amount ? ' ' + rows[i].amount : ''}${on ? ', assigned' : ''}`);
  });
  refresh();

  const commit = (i, closeAfter) => {
    const r = rows[i]; if (!r) return;
    document.dispatchEvent(new CustomEvent('splitsmart:assign', { detail: { itemId: r.itemId, memberId: r.memberId } }));
    if (closeAfter) closePopup(false); else refresh();
  };

  const wheel = createWheel(wheelEl, track, rowEls);
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); wheel.goTo(wheel.active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); wheel.goTo(wheel.active - 1); }
    else if (e.key === 'Home') { e.preventDefault(); wheel.goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); wheel.goTo(rows.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); commit(wheel.active, false); }
    else if (e.key === 'Tab') e.preventDefault();   // single focus stop; Esc closes
  };
  const onOutside = e => { if (!el.contains(e.target) && !(drag && drag.started)) closePopup(); };
  bubble = { el, glass, body, scrim, wheel, rows, rowEls, g, commit, refresh, onKey, onOutside, opener: src, loop: 0 };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onOutside, true);
  wheelEl.addEventListener('wheel-tap', e => commit(e.detail, false));

  if (!reduced.matches) {
    glass.animate([
      { ...g.circle, opacity: 0, transform: 'scale(.3)', offset: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { ...g.circle, opacity: 1, transform: 'scale(1.3)', offset: .2, easing: 'ease-in-out' },
      { ...g.circle, opacity: .92, transform: 'scale(.8)', offset: .36, easing: 'cubic-bezier(.2,.9,.25,1.1)' },
      { ...g.full, opacity: 1, transform: 'scale(1)', offset: 1 }
    ], { duration: 760, fill: 'both' });
    body.animate([
      { opacity: 0, filter: 'blur(14px)', transform: 'translateY(34px) scale(.97, .9)' },
      { opacity: 1, filter: 'blur(0px)', transform: 'none' }
    ], { duration: 560, delay: 300, easing: 'cubic-bezier(.2,1.15,.3,1)', fill: 'backwards' });
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, fill: 'both' });
  }
  wheelEl.focus({ preventScroll: true });
  return bubble;
}

const rowUnder = (x, y) => {
  const r = document.elementFromPoint(x, y)?.closest?.('.wheel-item');
  return r && bubble?.el.contains(r) ? r : null;
};

function dragFrame() {
  if (!drag?.started || !bubble) return;
  const b = bubble, wr = b.el.querySelector('.wheel').getBoundingClientRect();
  const inside = drag.x > wr.left - 24 && drag.x < wr.right + 24;
  const EDGE = 64;
  let speed = 0;                                       
  if (inside && drag.y > wr.top - 16 && drag.y < wr.top + EDGE) speed = -(1 - (drag.y - wr.top + 16) / (EDGE + 16)) * 520;
  else if (inside && drag.y < wr.bottom + 16 && drag.y > wr.bottom - EDGE) speed = (1 - (wr.bottom + 16 - drag.y) / (EDGE + 16)) * 520;
  if (speed) b.wheel.nudge(speed / 60);
  const hit = rowUnder(drag.x, drag.y);
  b.rowEls.forEach(r => r.classList.toggle('is-target', r === hit));
  b.loop = requestAnimationFrame(dragFrame);
}

function startDrag() {
  if (!drag || drag.started) return;
  const b = openPopup(drag.src, drag.x, drag.y, { mode: 'drag' });
  if (!b) { endDrag(); return; }
  drag.started = true;
  drag.src.classList.add('is-dnd-src');
  document.body.classList.add('is-dnd');
  const ghost = document.createElement('div');
  ghost.className = 'dnd-ghost'; ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = drag.src.dataset.personName || drag.src.dataset.itemName || '';
  document.body.appendChild(ghost); drag.ghost = ghost;
  moveGhost();
  b.loop = requestAnimationFrame(dragFrame);
}
const moveGhost = () => { if (drag?.ghost) drag.ghost.style.transform = `translate3d(${drag.x + 16}px, ${drag.y + 14}px, 0)`; };

function endDrag() {
  if (!drag) return;
  clearTimeout(drag.timer);
  drag.ghost?.remove();
  drag.src.classList.remove('is-dnd-src');
  document.body.classList.remove('is-dnd');
  if (bubble) { cancelAnimationFrame(bubble.loop); bubble.rowEls.forEach(r => r.classList.remove('is-target')); bubble.wheel.settle(); }
  drag = null;
}

document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const src = e.target.closest?.('[data-dnd]');
  if (!src || !src.closest(SCOPE) || e.target.closest('.ai-unroll, a, textarea, .food-bubble')) return;
  if (drag) endDrag();
  drag = { src, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, started: false, touch: e.pointerType === 'touch', timer: 0, ghost: null };
  if (drag.touch) drag.timer = setTimeout(() => { if (drag && !drag.started) startDrag(); }, 380);   // long-press
}, true);

document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.x = e.clientX; drag.y = e.clientY;
  if (!drag.started) {
    const dist = Math.hypot(drag.x - drag.x0, drag.y - drag.y0);
    if (drag.touch) { if (dist > 10) endDrag(); }             
    else if (dist > 6) { startDrag(); }
  } else moveGhost();
}, { passive: true });

const finishPointer = (e, cancelled) => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.started) {
    suppressClickUntil = performance.now() + 350;            
    const hit = !cancelled && bubble ? rowUnder(e.clientX, e.clientY) : null;
    if (hit) { const i = bubble.rowEls.indexOf(hit); const b = bubble; endDrag(); b.commit(i, true); return; }
  }
  endDrag();
};
document.addEventListener('pointerup', e => finishPointer(e, false), true);
document.addEventListener('pointercancel', e => finishPointer(e, true), true);
document.addEventListener('touchmove', e => { if (drag?.started && e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('selectstart', e => { if (drag) e.preventDefault(); }, true);

document.addEventListener('click', e => {
  const src = e.target.closest?.('[data-dnd]');
  if (!src || !src.closest(SCOPE)) return;
  if (performance.now() < suppressClickUntil || drag?.started) { e.preventDefault(); e.stopPropagation(); return; }
  if (e.shiftKey) { e.preventDefault(); e.stopPropagation(); const r = src.getBoundingClientRect(); openPopup(src, r.left + r.width / 2, r.bottom, { mode: 'pick' }); }
}, true);
document.addEventListener('contextmenu', e => {
  const src = e.target.closest?.('[data-dnd]');
  if (src && src.closest(SCOPE)) { e.preventDefault(); openPopup(src, e.clientX, e.clientY, { mode: 'pick' }); suppressClickUntil = performance.now() + 450; }
}, true);
document.addEventListener('keydown', e => {
  if (bubble) return;
  const src = e.target.closest?.('[data-dnd]');
  if (!src || !src.closest(SCOPE)) return;
  const arrow = e.key === 'ArrowDown' && !!src.closest('.assign-page'); 
  if (arrow || (e.key === 'Enter' && e.shiftKey)) {
    e.preventDefault(); e.stopPropagation();
    const r = src.getBoundingClientRect(); openPopup(src, r.left + r.width / 2, r.bottom, { mode: 'pick' });
  }
}, true);

const appEl = $('#app');
if (appEl) new MutationObserver(() => { if (bubble && !document.querySelector(SCOPE)) closePopup(false); }).observe(appEl, { childList: true });

initHalo();
