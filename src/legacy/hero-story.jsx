/**
 * SplitSmart — hero-story.jsx
 * Landing-page hero: "Good food. Great friends. Fair splits."
 *
 * One deterministic loop clock drives every element. Each element is a pure
 * function of loop time (hero-motion.jsx springs/eases), so the story is the same
 * on every run, the loop closes exactly (frame 0 === frame LOOP), and the whole
 * thing can be paused, seeked or frozen for reduced motion.
 *
 * Loop timeline (ms):
 *    0 –  1400  friends and dishes at the table (steam only)
 * 1400 –  2500  table recedes, friends stand up, the shared bill rises
 * 2700 –  4900  each dish flies to whoever ate it (naan is shared)
 * 4950 –  5600  tax & discount split in proportion to what each person had
 * 5900 –  7400  bill collapses to the group total, three share cards open, checks land
 * 7400 –  9300  hold the result
 * 9300 – 11500  cards merge back, bill folds into the table, scene returns to start
 */
import { formatCurrency } from './algorithm.jsx';
import { buildStory } from './hero-data.jsx';
import { sceneMarkup, tokenSpecs, LAYOUT } from './hero-art.jsx';
import { clamp01, lerp, seg, easeOut, easeInOut, spring, springSoft, arc, pulse } from './hero-motion.jsx';

const LOOP = 12000;        // must stay a multiple of the 2400ms steam period
const LOOP_START = 1100;   // global clock value at which loop time 0 begins
const INTRO_END = 2000;    // first-visit entrance finishes
const FLY = 520, TAXFLY = 560;

const T = {
  rise: [1400, 2500], billIn: [1700, 2500], ghost: [2300, 2800],
  assign: [2700, 3250, 3800, 4350], tax: 4950,
  collapse: [5900, 6600], open: 6100, conn: [6400, 7000], check: 6900,
  hold: 7800,
  retract: [9300, 9900], checkOut: [9300, 9500], merge: [9700, 10500],
  fold: [10300, 10900], down: [10400, 11500]
};
const CAPTION_AT = [1800, 5800, 11200]; // "Good food." → "Great friends." → "Fair splits."

const story = buildStory();
const specs = tokenSpecs(story);
const { friendX, friendYDining, friendScaleDining, friendYStand, cardY, table, bill, rowCenters, taxCenter } = LAYOUT;

/** Survives re-renders of the dashboard so the animation never restarts. */
const carry = { clock: 0 };

const SUMMARY = `Three friends share a dinner at House of Thali. The ${formatCurrency(story.totalPaise)} bill is divided by what each person ate, with tax and discount shared in proportion: ${story.friends.map(f => `${f.name} ${formatCurrency(f.sharePaise)}`).join(', ')}.`;

export function heroStoryMarkup() {
  return `<div class="hero-story" data-hero-story>
    <div class="hero-story-bar">
      <p class="hero-story-caption" aria-hidden="true"><span data-r="cap0">Good food.</span><span data-r="cap1">Great friends.</span><span data-r="cap2">Fair splits.</span></p>
      <button type="button" class="hero-story-toggle" data-r="toggle" aria-pressed="false" aria-label="Pause animation">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-pause" d="M8 5v14M16 5v14"/><path class="i-play" d="M8 5.5v13l11-6.5z"/></svg>
      </button>
    </div>
    <div class="hero-story-art" role="img" aria-label="${SUMMARY}">${sceneMarkup(story, specs)}</div>
  </div>`;
}

export function mountHeroStory(host) {
  if (!host || host.dataset.mounted) return;
  host.dataset.mounted = '1';

  const R = {};
  host.querySelectorAll('[data-r]').forEach(el => { R[el.dataset.r] = el; });
  const reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- tiny DOM writers that skip redundant writes ---------- */
  const cache = new Map();
  const attr = (el, name, val) => {
    const key = el;
    let c = cache.get(key); if (!c) { c = {}; cache.set(key, c); }
    if (c[name] === val) return;
    c[name] = val; el.setAttribute(name, val);
  };
  const place = (el, x, y, s = 1, r = 0) =>
    attr(el, 'transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})${s !== 1 ? ` scale(${s.toFixed(4)})` : ''}${r ? ` rotate(${r.toFixed(2)})` : ''}`);
  const op = (el, v) => attr(el, 'opacity', clamp01(v).toFixed(3));
  const text = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  const flag = (el, name, on) => { if (el.classList.contains(name) !== on) el.classList.toggle(name, on); };

  /* ---------- static geometry set once ---------- */
  story.friends.forEach((f, i) => {
    const px = 220 + (friendX[i] - 220) * 0.3;
    R[`conn${i}`].setAttribute('d', `M${friendX[i]} ${cardY + 32}C${friendX[i]} ${cardY + 72} ${px} ${bill.y - 76} ${px} ${bill.y - 30}`);
  });

  /* ---------- value events: when each friend's counter changes ---------- */
  const events = story.friends.map(() => []);
  const tokenTimes = specs.map((s, k) => {
    const isTax = s.kind === 'tax';
    const j = isTax ? 0 : story.dishes[s.di].parts.findIndex(p => p.friendIdx === s.friendIdx);
    const delay = isTax ? s.friendIdx * 90 : j * 80;
    const t0 = (isTax ? T.tax : T.assign[s.di]) + delay;
    const dur = isTax ? TAXFLY : FLY;
    events[s.friendIdx].push({ t: t0 + dur, add: s.paise });
    return { t0, dur };
  });
  events.forEach(list => { let sum = 0; list.sort((a, b) => a.t - b.t).forEach(e => { sum += e.add; e.to = sum; }); });
  const COUNT = 320;
  const valueAt = (list, lt) => {
    let prev = 0;
    for (const e of list) {
      if (lt >= e.t + COUNT) prev = e.to;
      else if (lt >= e.t) return Math.round(lerp(prev, e.to, easeOut((lt - e.t) / COUNT)));
      else break;
    }
    return prev;
  };

  /* ---------- one frame, fully determined by (clock, lt) ---------- */
  function render(clock, lt) {
    const intro = clock < INTRO_END;
    const ik = i => (intro ? spring(seg(clock, 120 + i * 130, 820 + i * 130)) : 1);
    const io = i => (intro ? seg(clock, 120 + i * 130, 420 + i * 130) : 1);

    // Shared "stand up" progress: table recedes, friends rise, lamp lifts.
    const up = lt < T.down[0] ? springSoft(seg(lt, T.rise[0], T.rise[1])) : 1 - easeInOut(seg(lt, T.down[0], T.down[1]));

    // Lamp
    place(R.lamp, 0, -up * 34 - (1 - ik(11)) * 60);
    op(R.lamp, (1 - seg(up, 0, 0.6)) * io(11));

    // Table + dishes
    const tIn = ik(3);
    place(R.table, table.x, lerp(table.yDining, table.yFar, up), lerp(1, table.scaleFar, up) * lerp(0.86, 1, tIn));
    op(R.table, io(3));
    for (let d = 0; d < 8; d++) {
      const k = ik(4 + d);
      place(R[`dish${d}`], 0, -(1 - k) * 18);
      op(R[`dish${d}`], io(4 + d));
    }
    for (let j = 0; j < 3; j++) {
      const phase = ((((clock - LOOP_START) / 2400) + j / 3) % 1 + 1) % 1;
      op(R[`steam${j}`], Math.sin(phase * Math.PI) * 0.6);
      place(R[`steam${j}`], 0, -phase * 12);
    }

    // Friends
    story.friends.forEach((f, i) => {
      const k = ik(i);
      const x = friendX[i] + (i === 0 ? -(1 - k) * 90 : i === 2 ? (1 - k) * 90 : 0);
      const y = lerp(friendYDining[i], friendYStand, up) + (i === 1 ? (1 - k) * 50 : 0);
      place(R[`friend${i}`], x, y, lerp(friendScaleDining[i], 1, up));
      op(R[`friend${i}`], io(i));
    });

    // Bill: rise, collapse into the group total, fold back into the table
    const bi = spring(seg(lt, T.billIn[0], T.billIn[1]));
    const bOp = seg(lt, T.billIn[0], T.billIn[0] + 260);
    const c = easeInOut(seg(lt, T.collapse[0], T.collapse[1]));
    const fold = easeInOut(seg(lt, T.fold[0], T.fold[1]));
    place(R.bill, bill.x, bill.y + (1 - bi) * 48 + fold * 70, (0.94 + 0.06 * bi) * lerp(1, 0.55, fold), (1 - bi) * -2.5);
    op(R.bill, bOp * (1 - seg(fold, 0.45, 1)));
    const W = lerp(bill.w, 224, c), H = lerp(bill.h, 64, c), rx = lerp(16, 20, c);
    for (const id of ['billBg', 'billShadow']) {
      const el = R[id];
      attr(el, 'x', (-W / 2).toFixed(2)); attr(el, 'y', ((-H / 2) + (id === 'billShadow' ? 7 : 0)).toFixed(2));
      attr(el, 'width', W.toFixed(2)); attr(el, 'height', H.toFixed(2)); attr(el, 'rx', rx.toFixed(2));
    }
    op(R.billRows, 1 - seg(c, 0, 0.45));
    op(R.billPill, seg(c, 0.55, 1));

    // Rows: lime highlight, dimmed amount, owner badges
    const rowFx = (hlEl, amtEl, t0, dur) => {
      op(hlEl, seg(lt, t0 - 160, t0 + 80) * (1 - seg(lt, t0 + dur, t0 + dur + 450)) * 0.9);
      op(amtEl, 1 - 0.5 * seg(lt, t0 + 60, t0 + 200));
    };
    story.dishes.forEach((d, i) => {
      rowFx(R[`rowHl${i}`], R[`rowAmt${i}`], T.assign[i], FLY);
      d.parts.forEach((p, j) => {
        const b = R[`badge${i}_${j}`];
        const s = spring(seg(lt, T.assign[i] + j * 80 + FLY, T.assign[i] + j * 80 + FLY + 420));
        place(b, +b.dataset.x, +b.dataset.y, Math.max(0.0001, s));
        op(b, s * 8);
      });
    });
    rowFx(R.rowHlTax, R.rowAmtTax, T.tax, TAXFLY);

    // Tokens flying from the bill to each person
    specs.forEach((s, k) => {
      const { t0, dur } = tokenTimes[k];
      const p = seg(lt, t0, t0 + dur);
      const pop = spring(seg(lt, t0 - 140, t0 + 120));
      const sx = bill.x + 56, sy = bill.y + (s.kind === 'tax' ? taxCenter : rowCenters[s.di]);
      const ex = friendX[s.friendIdx], ey = cardY;
      const [x, y] = arc(easeInOut(p), sx, sy, ex, ey, 70, (ex - sx) * 0.15);
      place(R[`tok${k}`], x, y, Math.max(0.0001, pop * lerp(1, 0.82, p)), Math.sin(p * Math.PI) * (ex > sx ? 7 : -7));
      op(R[`tok${k}`], pop > 0.01 ? 1 - seg(p, 0.82, 1) : 0);
    });

    // Share cards (start as compact slots, receive amounts, open into named cards)
    const chkOut = seg(lt, T.checkOut[0], T.checkOut[1]);
    story.friends.forEach((f, i) => {
      const cx = friendX[i];
      const expandIn = spring(seg(lt, T.open + i * 90, T.open + i * 90 + 650));
      const expandOut = easeInOut(seg(lt, T.retract[0] + i * 50, T.retract[1] + i * 50));
      const ex = expandIn * (1 - expandOut);
      const w = lerp(78, 128, ex), h = lerp(34, 60, ex);
      const m = easeInOut(seg(lt, T.merge[0] + i * 70, T.merge[1] + i * 70));
      const [px, py] = arc(m, cx, cardY, bill.x, bill.y, 50);
      const arrivals = events[i];
      let bump = 0, glow = 0;
      for (const e of arrivals) {
        bump = Math.max(bump, pulse(seg(lt, e.t, e.t + 450)));
        const g = seg(lt, e.t, e.t + 750); if (g > 0 && g < 1) glow = Math.max(glow, 1 - g);
      }
      place(R[`card${i}`], px, py, (1 + 0.1 * bump) * lerp(1, 0.5, m));
      const vis = seg(lt, T.ghost[0], T.ghost[1]) * (1 - seg(m, 0.6, 1));
      op(R[`card${i}`], vis);
      const active = lt >= arrivals[0].t - 60;
      flag(R[`cardBg${i}`], 'is-active', active);
      flag(R[`cardAmt${i}`], 'is-ghost', !active);
      const bg = R[`cardBg${i}`];
      attr(bg, 'x', (-w / 2).toFixed(2)); attr(bg, 'y', (-h / 2).toFixed(2));
      attr(bg, 'width', w.toFixed(2)); attr(bg, 'height', h.toFixed(2)); attr(bg, 'rx', Math.min(h / 2, lerp(17, 16, ex)).toFixed(2));
      attr(R[`cardAmt${i}`], 'y', lerp(5.5, 11, ex).toFixed(2));
      attr(R[`cardName${i}`], 'y', '-8');
      op(R[`cardName${i}`], clamp01((ex - 0.3) / 0.7));
      text(R[`cardAmt${i}`], formatCurrency(valueAt(arrivals, lt)));
      const chk = spring(seg(lt, T.check + i * 100, T.check + i * 100 + 450)) * (1 - chkOut);
      place(R[`cardChk${i}`], w / 2 - 5, -h / 2 + 5, Math.max(0.0001, chk));
      op(R[`cardChk${i}`], chk * 8);

      // Avatar ring: pulses on each hand-off, stays lit once the split is complete
      op(R[`ring${i}`], Math.max(glow * 0.9, chk * 0.85));

      // Connector from the group total to this card
      const cp = easeInOut(seg(lt, T.conn[0] + i * 60, T.conn[1] + i * 60)) * (1 - easeInOut(seg(lt, T.retract[0], T.retract[1])));
      attr(R[`conn${i}`], 'stroke-dashoffset', (1 - cp).toFixed(4));
      op(R[`conn${i}`], cp * 10);
    });
    const pillChk = spring(seg(lt, T.check - 100, T.check + 350)) * (1 - chkOut);
    place(R.pillChk, -bill.w / 2 + 30, 0, Math.max(0.0001, pillChk));
    op(R.pillChk, pillChk * 8);

    // Caption: Good food. → Great friends. → Fair splits.
    const L2 = lt < 2200 ? lt + LOOP : lt;
    const weights = [
      seg(L2, CAPTION_AT[2], CAPTION_AT[2] + 300) * (1 - seg(L2, CAPTION_AT[0] + LOOP, CAPTION_AT[0] + LOOP + 300)),
      seg(lt, CAPTION_AT[0], CAPTION_AT[0] + 300) * (1 - seg(lt, CAPTION_AT[1], CAPTION_AT[1] + 300)),
      seg(lt, CAPTION_AT[1], CAPTION_AT[1] + 300) * (1 - seg(lt, CAPTION_AT[2], CAPTION_AT[2] + 300))
    ];
    weights.forEach((w, i) => {
      const el = R[`cap${i}`];
      attr(el, 'style', `opacity:${w.toFixed(3)};transform:translateY(${((1 - w) * 6).toFixed(2)}px)`);
    });
  }

  /* ---------- lifecycle ---------- */
  let clock = carry.clock, last = 0, raf = 0, paused = false, inView = true, staticMode = false;
  const loopTime = ck => (ck < LOOP_START ? 0 : (ck - LOOP_START) % LOOP);

  function frame(now) {
    raf = 0;
    if (!host.isConnected) { stop(true); return; }
    const dt = last ? Math.min(64, now - last) : 16;
    last = now;
    clock += dt; carry.clock = clock;
    render(clock, loopTime(clock));
    schedule();
  }
  function schedule() {
    if (!raf && !staticMode && !paused && inView && !document.hidden) raf = requestAnimationFrame(frame);
  }
  function stop(final) {
    if (raf) cancelAnimationFrame(raf); raf = 0; last = 0;
    if (final) { io?.disconnect(); document.removeEventListener('visibilitychange', onVis); reducedMq.removeEventListener?.('change', applyMode); }
  }
  const onVis = () => { last = 0; schedule(); };
  document.addEventListener('visibilitychange', onVis);

  const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    inView = entries[entries.length - 1].isIntersecting; last = 0; schedule();
  }, { threshold: 0.05 }) : null;
  io?.observe(host);

  function applyMode() {
    staticMode = reducedMq.matches || !story.ok;
    host.dataset.motion = staticMode ? 'static' : 'live';
    if (staticMode) { stop(false); clock = 99999; render(clock, T.hold); }
    else { last = 0; schedule(); }
  }
  reducedMq.addEventListener?.('change', applyMode);

  const toggle = R.toggle;
  toggle.addEventListener('click', () => {
    paused = !paused;
    toggle.setAttribute('aria-pressed', String(paused));
    toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    host.classList.toggle('is-paused', paused);
    last = 0; schedule();
  });

  // QA hook: jump to any loop time (ms) and freeze there.
  host.seek = ms => { paused = true; stop(false); const lt = ((ms % LOOP) + LOOP) % LOOP; clock = LOOP_START + LOOP + lt; render(clock, lt); };

  // Resume mid-loop after a re-render, otherwise play the entrance once.
  if (carry.clock > INTRO_END) clock = carry.clock;
  render(clock, loopTime(clock));
  applyMode();
}
