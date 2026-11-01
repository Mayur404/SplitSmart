import { $$, $, S, currentBill } from './core.jsx';
import { clearSettlementBurst, finishViewRender } from './effects.jsx';
import { renderGasResponses } from './gas/responses.jsx';
import { gasResponseCache, gasResponseUpdatedAt, readGasBillMeta, readSavedGasResponses } from './gas/storage.jsx';
import { renderInfoPage } from './pages/info.jsx';
import { renderAssign } from './views/assign.jsx';
import { renderBill } from './views/bill.jsx';
import { renderBreakdown } from './views/breakdown.jsx';
import { renderClaim } from './views/claim.jsx';
import { renderDashboard } from './views/dashboard.jsx';
import { renderGroups } from './views/groups.jsx';
import { renderSettings } from './views/settings.jsx';
import { renderSettlements } from './views/settlements.jsx';

const INFO_VIEWS = ['terms', 'privacy', 'disclaimer', 'support', 'report'];


export function go(targetView) {
  const update = () => {
    S.view = targetView;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const app = $('#app');
    if (app) {
      app.classList.remove('page-enter');
      requestAnimationFrame(() => app.classList.add('page-enter'));
    }
  };

  if (INFO_VIEWS.includes(targetView)) {
    history.pushState({ view: targetView }, '', `#${targetView}`);
  }

  if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

window.addEventListener('popstate', () => {
  const target = window.location.hash.slice(1);
  if (INFO_VIEWS.includes(target)) {
    S.view = target;
    render();
  } else if (INFO_VIEWS.includes(S.view)) {
    S.view = 'dashboard';
    render();
  }
});

export function setNav() {
  $$('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === S.view);
  });
  const titles = {
    dashboard: 'Overview',
    groups: 'Groups',
    bill: 'New Bill',
    assign: 'Assign',
    breakdown: 'Review Shares',
    settlements: 'Settle Up',
    settings: 'Settings',
    claim: 'Claim Your Items',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    disclaimer: 'Disclaimer',
    support: 'Contact Support',
    report: 'Report a Problem'
  };
  const title = titles[S.view] || 'SplitSmart';
  const bc = $('#breadcrumb');
  if (bc) bc.textContent = title;
  document.title = `${title} — SplitSmart`;
}

export function render() {
  const entryView = S.view;
  const didNavigate = entryView !== S.lastRenderedView;
  if (didNavigate) {
    S.lastRenderedView = entryView;
    if (entryView !== 'settlements') clearSettlementBurst();
  }

  setNav();
  if (window.location.hash.startsWith('#data=')) {
    S.view = 'claim';
    const claimDidNavigate = S.view !== S.lastRenderedView;
    if (claimDidNavigate) {
      S.lastRenderedView = S.view;
      clearSettlementBurst();
    }
    setNav();
    renderClaim();
    finishViewRender('claim', claimDidNavigate);
    return;
  }

  switch (S.view) {
    case 'dashboard': renderDashboard(); break;
    case 'groups': renderGroups(); break;
    case 'bill': renderBill(); break;
    case 'assign': S.assignAnimate = true; renderAssign(); break;
    case 'breakdown': renderBreakdown(); break;
    case 'settlements': renderSettlements(); break;
    case 'settings': renderSettings(); break;
    case 'terms':
    case 'privacy':
    case 'disclaimer':
    case 'support':
    case 'report': renderInfoPage(S.view); break;
    default: renderDashboard();
  }
  const activeBill = currentBill();
  const activeMeta = readGasBillMeta(activeBill);
  if (S.view === 'assign' && activeBill?.id && activeMeta?.ownerKey && activeMeta?.formId) {
    const savedSnapshot = readSavedGasResponses(activeMeta.formId);
    const cachedRows = gasResponseCache.has(activeBill.id)
      ? gasResponseCache.get(activeBill.id)
      : savedSnapshot.rows;
    gasResponseCache.set(activeBill.id, cachedRows);
    if (savedSnapshot.updatedAt) gasResponseUpdatedAt.set(activeBill.id, savedSnapshot.updatedAt);
    renderGasResponses(cachedRows, { updatedAt: gasResponseUpdatedAt.get(activeBill.id) || savedSnapshot.updatedAt || null });
  } else {
    document.getElementById('formbridge-live-responses')?.remove();
  }
  finishViewRender(entryView, didNavigate);
}
