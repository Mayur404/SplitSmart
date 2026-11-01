/** SplitSmart — Delegated click handler: navigation, ambiguity choices, then data-action dispatch. */
import { $, S } from './core.jsx';
import { go } from './router.jsx';
import { renderClaim } from './views/claim.jsx';
import { setSidebarOpen } from './sidebar.jsx';
import * as general from './actions/general.jsx';
import * as groups from './actions/groups.jsx';
import * as bill from './actions/bill.jsx';
import * as assign from './actions/assign.jsx';
import * as settlement from './actions/settlement.jsx';
import * as claims from './actions/claims.jsx';

// action name -> handler module
const ACTION_MODULES = new Map();
[general, groups, bill, assign, settlement, claims].forEach(mod => {
  mod.ACTIONS.forEach(name => ACTION_MODULES.set(name, mod));
});

document.addEventListener('click', async e => {
  // Navigation Links
  const navBtn = e.target.closest('[data-view]');
  if (navBtn) {
    e.preventDefault();
    const target = navBtn.dataset.view;
    if (target === 'claim' && window.location.hash.startsWith('#data=')) {
      renderClaim();
    } else {
      go(target);
    }
    setSidebarOpen(false);
    return;
  }

  // Ambiguity choice
  const choiceBtn = e.target.closest('[data-choice-val]');
  if (choiceBtn && S.pendingAmbiguityAction) {
    const val = choiceBtn.dataset.choiceVal;
    $('#ambiguity-dialog').close();
    S.pendingAmbiguityAction(val);
    S.pendingAmbiguityAction = null;
    return;
  }

  // Actions
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;

  await ACTION_MODULES.get(action)?.handle(action, actionBtn, e);
});
