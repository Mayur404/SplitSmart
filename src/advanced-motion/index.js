/**
 * SplitSmart — Advanced theme helpers (presentation only).
 *
 * Does NOT touch app state, money math, or app.js. It only observes the DOM that app.js renders and adds:
 *   1. a sliding active-indicator in the sidebar nav,
 *   2. a workflow progress indicator managed by the React shell,
 *   3. data-screen on #app (used by CSS for the receipt look) and a staggered reveal on real view changes,
 *   4. count-up on grand totals / settlement amounts (final text is always restored exactly),
 *   5. letter-by-letter headline reveal + one light sweep,
 *   6. pointer effects (desktop only): spotlight cards, cursor glow, magnetic primary buttons, receipt tilt,
 *   7. ripple on buttons/chips, a pop on the chip you just toggled,
 *   8. a confetti burst when a settlement plan is generated or a claim is applied.
 *
 * Everything animated is skipped when prefers-reduced-motion is set, pointer effects need a fine pointer,
 * and NOTHING heavy runs on the guest claim screen (#data= links).
 *
 * The techniques (cursor spotlight, magnetic hover, split-text reveal, border beam, count-up, ripple, confetti)
 * are well-known web-motion patterns; this file is an original vanilla implementation, no third-party code copied.
 */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var nav = document.querySelector('.nav');
  var crumb = document.getElementById('breadcrumb');
  var toastRegion = document.getElementById('toast-region');
  var root = document.documentElement;
  if (!app) return;

  var reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var fineMq = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  function reduced() {
    return !!(reduceMq && reduceMq.matches);
  }
  function fine() {
    return !!(fineMq && fineMq.matches);
  }
  function isClaim() {
    return window.location.hash.indexOf('#data=') === 0;
  }
  function fxOn() {
    return !reduced() && !isClaim();
  }

  // ---- breadcrumb text (set by app.js setNav) -> view key ----
  var VIEW_BY_TITLE = {
    Overview: 'dashboard',
    'Group Roster': 'groups',
    'Bill & Receipt Entry': 'bill',
    'Assign Items': 'assign',
    'Individual Shares': 'breakdown',
    'Settle Up': 'settlements',
    Settings: 'settings',
    'Claim Your Items': 'claim',
  };
  var FLOW = [
    { key: 'bill', label: 'Bill' },
    { key: 'assign', label: 'Assign' },
    { key: 'breakdown', label: 'Shares' },
    { key: 'settlements', label: 'Settle' },
  ];

  function currentView() {
    var t = crumb ? crumb.textContent.trim() : '';
    return VIEW_BY_TITLE[t] || 'dashboard';
  }

  // ---- 1. Sliding nav indicator ----
  var indicator = null;
  function initIndicator() {
    if (!nav) return;
    indicator = document.createElement('span');
    indicator.className = 'nav-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    nav.insertBefore(indicator, nav.firstChild);
    nav.classList.add('has-indicator');
    placeIndicator(true);
    new MutationObserver(function (records) {
      // Ignore our own indicator's class changes (would loop forever).
      for (var i = 0; i < records.length; i++) {
        if (records[i].target !== indicator) {
          placeIndicator(false);
          return;
        }
      }
    }).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
    window.addEventListener('resize', function () {
      placeIndicator(true);
    });
  }
  function placeIndicator(instant) {
    if (!indicator) return;
    var active = nav.querySelector('.nav-link.active');
    if (!active) {
      if (indicator.classList.contains('ready')) indicator.classList.remove('ready');
      return;
    }
    if (instant || reduced()) indicator.style.transition = 'none';
    indicator.style.height = active.offsetHeight + 'px';
    indicator.style.transform = 'translateY(' + active.offsetTop + 'px)';
    if (instant || reduced()) {
      void indicator.offsetHeight; // flush, then re-enable CSS transition
      indicator.style.transition = '';
    }
    if (!indicator.classList.contains('ready')) indicator.classList.add('ready');
  }

  // Flow progress is rendered by React in src/legacy/components/FlowProgress.jsx.

  // ---- 4. Count-up (Indian grouping, mirrors algorithm.js formatCurrency) ----
  function formatPaise(p) {
    var sign = p < 0 ? '-' : '';
    var abs = Math.abs(p);
    var r = String(Math.floor(abs / 100));
    var pp = String(abs % 100).padStart(2, '0');
    if (r.length > 3) r = r.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + r.slice(-3);
    return sign + '₹' + r + '.' + pp;
  }
  function countUp(el) {
    var finalText = el.textContent.trim();
    var m = /^(-?)₹([\d,]+)\.(\d{2})$/.exec(finalText);
    if (!m) return;
    var target =
      (m[1] ? -1 : 1) * (parseInt(m[2].replace(/,/g, ''), 10) * 100 + parseInt(m[3], 10));
    if (formatPaise(target) !== finalText) return; // only animate what we can reproduce exactly
    if (Math.abs(target) < 100) return;
    var start = performance.now();
    var dur = 900;
    function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 4);
      el.textContent = t < 1 ? formatPaise(Math.round(target * eased)) : finalText;
      if (t < 1) requestAnimationFrame(tick);
      else {
        el.classList.add('count-done');
        setTimeout(function () {
          el.classList.remove('count-done');
        }, 700);
      }
    }
    requestAnimationFrame(tick);
  }
  function runCounts() {
    Array.prototype.forEach.call(
      app.querySelectorAll('.settlement-amount, .total-line.grand .amount'),
      countUp,
    );
  }

  // ---- 5. Headline reveal: split into letters (aria-label keeps the real text), then one light sweep ----
  function splitHeading() {
    var h1 = app.querySelector('.page-head h1');
    if (!h1 || h1.children.length) return;
    var text = h1.textContent;
    if (!text || text.length > 40) return;
    h1.setAttribute('aria-label', text);
    h1.textContent = '';
    var i = 0;
    text.split('').forEach(function (ch) {
      var s = document.createElement('span');
      s.className = 'fx-char';
      s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--i', String(i++));
      s.textContent = ch;
      h1.appendChild(s);
    });
    var total = 700 + text.length * 26;
    setTimeout(function () {
      if (!h1.isConnected) return;
      h1.textContent = text; // restore plain text (clean DOM for the sweep + screen readers)
      h1.removeAttribute('aria-label');
      h1.classList.add('fx-shine');
    }, total);
  }

  // ---- 3. View change handling ----
  var lastView = null;
  var enterTimer = null;
  var pendingChip = null; // which chip the user just toggled
  function onRender() {
    var claim = isClaim();
    var view = claim ? 'claim' : currentView();
    root.classList.toggle('is-claim', claim);
    app.dataset.screen = view; // NOT data-view: app.js routes clicks on any [data-view] ancestor

    // stagger index for rows/cards (used by CSS delays)
    Array.prototype.forEach.call(
      app.querySelectorAll('.settlement, details.breakdown-item, .list-row, .assignment-item'),
      function (el) {
        var idx = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.setProperty('--r', String(Math.min(idx, 10)));
      },
    );

    if (pendingChip && fxOn()) {
      var c = app.querySelector(
        '.chip[data-item-id="' +
          pendingChip.item +
          '"][data-member-id="' +
          pendingChip.member +
          '"]',
      );
      pendingChip = null;
      if (c) {
        c.classList.add('just-toggled');
        setTimeout(function () {
          c.classList.remove('just-toggled');
        }, 600);
      }
    }

    if (view !== lastView) {
      lastView = view;
      if (fxOn()) {
        app.classList.add('view-enter');
        clearTimeout(enterTimer);
        enterTimer = setTimeout(function () {
          app.classList.remove('view-enter');
        }, 1500);
        splitHeading();
        runCounts();
      }
    }
  }

  // ---- 6. Pointer effects (fine pointers only) ----
  var raf = 0,
    lastEv = null;
  function onMove(e) {
    lastEv = e;
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      var ev = lastEv;
      if (!fxOn() || !fine()) return;
      root.style.setProperty('--gx', ev.clientX + 'px');
      root.style.setProperty('--gy', ev.clientY + 'px');

      var card = ev.target.closest ? ev.target.closest('.panel, .hero, .settlement') : null;
      var prev = document.querySelector('.spot');
      if (prev && prev !== card) prev.classList.remove('spot');
      if (card) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ev.clientX - r.left + 'px');
        card.style.setProperty('--my', ev.clientY - r.top + 'px');
        card.classList.add('spot');
      }

      // magnetic primary buttons: they lean toward the pointer
      var btn = ev.target.closest ? ev.target.closest('.button-primary') : null;
      var prevBtn = document.querySelector('.button-primary.mag');
      if (prevBtn && prevBtn !== btn) {
        prevBtn.classList.remove('mag');
        prevBtn.style.removeProperty('--tx');
        prevBtn.style.removeProperty('--ty');
      }
      if (btn) {
        var b = btn.getBoundingClientRect();
        var dx = (ev.clientX - (b.left + b.width / 2)) / (b.width / 2);
        var dy = (ev.clientY - (b.top + b.height / 2)) / (b.height / 2);
        btn.classList.add('mag');
        btn.style.setProperty('--tx', (dx * 5).toFixed(1) + 'px');
        btn.style.setProperty('--ty', (dy * 3).toFixed(1) + 'px');
      }

      // receipt tilt: only on the breakdown/settlement receipts, and never while over a control
      var screen = app.dataset.screen;
      var rec =
        (screen === 'breakdown' || screen === 'settlements') && ev.target.closest
          ? ev.target.closest('.panel')
          : null;
      var prevTilt = document.querySelector('.panel.tilt');
      if (prevTilt && prevTilt !== rec) {
        prevTilt.classList.remove('tilt');
        prevTilt.style.removeProperty('--rx');
        prevTilt.style.removeProperty('--ry');
      }
      if (rec) {
        var overControl = ev.target.closest('button, a, input, select, textarea, summary, label');
        var pr = rec.getBoundingClientRect();
        rec.classList.add('tilt');
        if (overControl) {
          rec.style.setProperty('--rx', '0deg');
          rec.style.setProperty('--ry', '0deg');
        } else {
          rec.style.setProperty(
            '--rx',
            ((0.5 - (ev.clientY - pr.top) / pr.height) * 2.4).toFixed(2) + 'deg',
          );
          rec.style.setProperty(
            '--ry',
            (((ev.clientX - pr.left) / pr.width - 0.5) * 2.4).toFixed(2) + 'deg',
          );
        }
      }
    });
  }
  document.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('mouseleave', function () {
    ['.spot', '.button-primary.mag', '.panel.tilt'].forEach(function (sel) {
      var el = document.querySelector(sel);
      if (el) {
        el.classList.remove('spot', 'mag', 'tilt');
        el.style.removeProperty('--tx');
        el.style.removeProperty('--ty');
        el.style.removeProperty('--rx');
        el.style.removeProperty('--ry');
      }
    });
  });

  // ---- 7. Ripple + chip tracking (capture phase: runs before app.js re-renders) ----
  document.addEventListener(
    'pointerdown',
    function (e) {
      if (!fxOn() || !e.target.closest) return;
      var host = e.target.closest('.button, .chip, .tab');
      if (!host || host.disabled) return;
      var r = host.getBoundingClientRect();
      var size = Math.max(r.width, r.height) * 2.2;
      var s = document.createElement('span');
      s.className = 'fx-ripple';
      s.style.width = s.style.height = size + 'px';
      s.style.left = e.clientX - r.left - size / 2 + 'px';
      s.style.top = e.clientY - r.top - size / 2 + 'px';
      host.appendChild(s);
      setTimeout(function () {
        if (s.parentNode) s.parentNode.removeChild(s);
      }, 700);
    },
    true,
  );
  document.addEventListener(
    'click',
    function (e) {
      var chip = e.target.closest && e.target.closest('.chip[data-action="toggle-assignment"]');
      if (chip) pendingChip = { item: chip.dataset.itemId, member: chip.dataset.memberId };
    },
    true,
  );

  // ---- 8. Confetti burst on success toasts ----
  function confetti() {
    if (!fxOn()) return;
    var box = document.createElement('div');
    box.className = 'fx-confetti';
    box.setAttribute('aria-hidden', 'true');
    box.style.left = Math.round(window.innerWidth * 0.5) + 'px';
    box.style.top = Math.round(window.innerHeight * 0.32) + 'px';
    var colors = [
      'var(--accent-fill)',
      'var(--saffron)',
      'var(--success)',
      'var(--accent-strong)',
      'var(--saffron-soft)',
    ];
    var spread = Math.min(420, window.innerWidth * 0.55);
    for (var i = 0; i < 46; i++) {
      var p = document.createElement('i');
      p.style.setProperty('--c', colors[i % colors.length]);
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 2 * spread).toFixed(0) + 'px');
      p.style.setProperty('--uy', (-80 - Math.random() * 160).toFixed(0) + 'px');
      p.style.setProperty('--dy', (140 + Math.random() * 260).toFixed(0) + 'px');
      p.style.setProperty('--rot', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * 120).toFixed(0) + 'ms';
      box.appendChild(p);
    }
    document.body.appendChild(box);
    setTimeout(function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    }, 1700);
  }
  if (toastRegion) {
    new MutationObserver(function (records) {
      records.forEach(function (rec) {
        Array.prototype.forEach.call(rec.addedNodes, function (n) {
          if (
            n.nodeType === 1 &&
            !n.classList.contains('error') &&
            /Settlement plan generated|applied successfully/i.test(n.textContent)
          )
            confetti();
        });
      });
    }).observe(toastRegion, { childList: true });
  }

  initIndicator();
  new MutationObserver(onRender).observe(app, { childList: true });
  window.addEventListener('hashchange', onRender);
  onRender();
})();
