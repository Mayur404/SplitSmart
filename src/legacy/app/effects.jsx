import { $, S } from './core.jsx';

let pageMotionObserver = null;
let settlementBurstElement = null;
let settlementBurstTimeout = null;

export function setupPageMotion() {
  pageMotionObserver?.disconnect();
  const app = $('#app');
  if (!app || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const targets = app.querySelectorAll('.panel, .metric-card, .dashboard-footer, .workflow-steps');
  targets.forEach((element, index) => {
    element.classList.add('page-reveal');
    element.style.transitionDelay = `${Math.min(index * 45, 240)}ms`;
  });

  pageMotionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('page-reveal-visible');
        pageMotionObserver?.unobserve(entry.target);
      }
    });
  }, { threshold: .08, rootMargin: '0px 0px -7% 0px' });

  targets.forEach(target => pageMotionObserver.observe(target));
}

export function animatePageHeadings() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  document.querySelectorAll('#app h1').forEach(heading => {
    if (heading.dataset.ssHeadingAnimated === 'true') return;
    const label = (heading.innerText || heading.textContent || '').replace(/\s+/g, ' ').trim();
    if (!label) return;

    if (!heading.hasAttribute('aria-label')) heading.setAttribute('aria-label', label);

    const stage = document.createElement('span');
    stage.className = 'ss-heading-stage';
    const sharp = document.createElement('span');
    sharp.className = 'ss-heading-sharp';
    sharp.setAttribute('aria-hidden', 'true');

    while (heading.firstChild) sharp.appendChild(heading.firstChild);

    const soft = sharp.cloneNode(true);
    soft.className = 'ss-heading-soft';
    soft.setAttribute('aria-hidden', 'true');
    soft.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));

    stage.append(sharp, soft);
    heading.appendChild(stage);
    heading.dataset.ssHeadingAnimated = 'true';
    heading.classList.add('ss-heading-reveal');
  });
}


export function clearSettlementBurst() {
  if (settlementBurstTimeout) window.clearTimeout(settlementBurstTimeout);
  settlementBurstTimeout = null;
  settlementBurstElement?.remove();
  settlementBurstElement = null;
}

export function playSettlementBurst() {
  clearSettlementBurst();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const page = document.querySelector('#app .settlement-page');
  if (!page) return;
  const bounds = page.getBoundingClientRect();
  const originX = bounds.left + bounds.width * 0.5;
  const originY = Math.max(78, bounds.top + 42);
  const isSmallScreen = window.matchMedia('(max-width: 600px)').matches;
  const particleCount = isSmallScreen ? 28 : 40;
  const burst = document.createElement('div');
  burst.className = 'ss-settlement-burst';
  burst.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('span');
    const driftX = (Math.random() - 0.5) * (isSmallScreen ? 430 : 780);
    const liftX = driftX * (0.18 + Math.random() * 0.12);
    const liftY = -(70 + Math.random() * 160);
    const fallY = 300 + Math.random() * (isSmallScreen ? 250 : 380);
    const spin = `${Math.round((Math.random() - 0.5) * 1150)}deg`;

    particle.className = `ss-confetti-piece ${Math.random() < 0.72 ? 'is-green' : 'is-gold'}`;
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.width = `${6 + Math.random() * 3}px`;
    particle.style.height = `${9 + Math.random() * 6}px`;
    particle.style.setProperty('--ss-lift-x', `${liftX.toFixed(1)}px`);
    particle.style.setProperty('--ss-lift-y', `${liftY.toFixed(1)}px`);
    particle.style.setProperty('--ss-drift-x', `${driftX.toFixed(1)}px`);
    particle.style.setProperty('--ss-fall-y', `${fallY.toFixed(1)}px`);
    particle.style.setProperty('--ss-spin', spin);
    particle.style.setProperty('--ss-lift-spin', `${Math.round(parseFloat(spin) * 0.22)}deg`);
    particle.style.animationDelay = `${Math.random() * 75}ms`;
    burst.appendChild(particle);
  }

  document.body.appendChild(burst);
  settlementBurstElement = burst;
  settlementBurstTimeout = window.setTimeout(clearSettlementBurst, 1080);
}

export function finishViewRender(entryView, didNavigate) {
  requestAnimationFrame(() => {
    setupPageMotion();
    if (!didNavigate || S.view !== entryView) return;
    animatePageHeadings();
    if (entryView === 'settlements') playSettlementBurst();
  });
}

