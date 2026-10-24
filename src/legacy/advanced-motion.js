/** Advanced interaction effects: scroll reveals and brief action feedback. */

const root = document.documentElement;
const app = document.getElementById('app');
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const revealSelector = [
  '.page-head',
  '#app > .columns',
  '#app > section.panel',
  '#app > .panel',
  '.settlement',
  '.assignment-item',
  'details.breakdown-item',
  '.breakdown-row:not(.head)',
  '.list-row',
  '.group-card',
].join(', ');

function restartClass(element, className, duration = 900) {
  if (!element) return;

  element.classList.remove(className);
  // Force a style boundary so repeated interactions replay the animation.
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), duration);
}

function setRevealState(element, observer) {
  if (!element || element.dataset.ssRevealBound === '1') return;

  element.dataset.ssRevealBound = '1';
  element.classList.add('ss-reveal');

  if (observer) observer.observe(element);
  else element.classList.add('ss-revealed');
}

function initializeAdvancedMotion() {
  if (!app || reduceMotion) return;

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('ss-revealed');
        observer?.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });
  }

  const prepareReveals = () => {
    if (!app) return;
    root.classList.add('ss-motion-ready');
    app.querySelectorAll(revealSelector).forEach((element, index) => {
      element.style.setProperty('--ss-reveal-delay', `${Math.min(index % 5, 4) * 48}ms`);
      setRevealState(element, observer);
    });
  };

  prepareReveals();

  const mutationObserver = 'MutationObserver' in window
    ? new MutationObserver(() => window.requestAnimationFrame(prepareReveals))
    : null;
  mutationObserver?.observe(app, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const assignmentChip = target.closest('[data-action="toggle-assignment"]');
    const actionButton = target.closest('[data-action]');
    const navigationButton = target.closest('[data-view]');

    if (assignmentChip) {
      const itemId = assignmentChip.getAttribute('data-item-id');
      const memberId = assignmentChip.getAttribute('data-member-id');

      window.setTimeout(() => {
        const rows = app.querySelectorAll('.assignment-item');
        const row = Array.from(rows).find((element) => element.getAttribute('data-item-id') === itemId);
        if (!row) return;

        const chips = row.querySelectorAll('[data-action="toggle-assignment"]');
        const selectedChip = Array.from(chips).find((element) => element.getAttribute('data-member-id') === memberId);
        if (selectedChip) restartClass(selectedChip, 'ss-assignment-pop', 520);
        restartClass(row, 'ss-assignment-updated', 650);
      }, 0);
      return;
    }

    if (actionButton) {
      const action = actionButton.getAttribute('data-action');
      const dialogEffects = {
        'open-qr': ['qr-dialog', 'ss-qr-assembling'],
        'split-threshold': ['split-dialog', 'ss-split-open'],
      };

      if (dialogEffects[action]) {
        const [dialogId, className] = dialogEffects[action];
        window.setTimeout(() => {
          const dialog = document.getElementById(dialogId);
          if (dialog?.open) restartClass(dialog, className, 1000);
        }, 20);
      } else if (action === 'finalize-settlement') {
        window.setTimeout(() => restartClass(app, 'ss-settlement-finale', 1600), 40);
      } else if ([
        'auto-split-diet', 'split-remaining-equally', 'unroll-all',
        'unroll-single', 'undo-unroll', 'run-command',
      ].includes(action)) {
        window.setTimeout(() => {
          const targetList = document.getElementById('assignment-list') || app;
          restartClass(targetList, 'ss-action-confirm', 650);
        }, 0);
      }
    }

    if (navigationButton) {
      window.setTimeout(() => {
        root.classList.add('ss-motion-ready');
        prepareReveals();
      }, 0);
    }
  }, true);
}

initializeAdvancedMotion();
