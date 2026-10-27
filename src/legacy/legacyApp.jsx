/**
 * SplitSmart legacy workflow controller (JSX edition).
 * Screen markup is isolated into focused React components under views/.
 * Existing delegated actions are retained as a compatibility boundary.
 */

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import DashboardView, { buildDashboardMarkup } from './views/DashboardView.jsx';
import GroupsView, { buildGroupsMarkup } from './views/GroupsView.jsx';
import BillView, { buildBillMarkup } from './views/BillView.jsx';
import AssignmentView, { buildAssignmentMarkup } from './views/AssignmentView.jsx';
import BreakdownView, { buildBreakdownMarkup } from './views/BreakdownView.jsx';
import SettlementsView, { buildSettlementsMarkup } from './views/SettlementsView.jsx';
import SettingsView, { buildSettingsMarkup } from './views/SettingsView.jsx';
import ClaimView, { buildClaimMarkup } from './views/ClaimView.jsx';

import {
  uid,
  freshRoster,
  templates,
  getRosters,
  saveRosters,
  getRecent,
  saveRecent,
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  isStorageAvailable
} from '../modules/state.js';

import {
  toPaise,
  rupees,
  formatCurrency,
  unrollItem,
  undoUnrollItem,
  calculateShares,
  netBalances,
  minimumCashFlow,
  runSelfTests
} from '../algorithms/algorithm.js';

import {
  paymentUri,
  renderQR,
  splitPayment,
  isValidUpiId
} from '../modules/qr.js';

import {
  makeSharePayload,
  encodeShare,
  decodeShare,
  claimMessage,
  parseClaim,
  whatsappUrl
} from '../modules/share.js';

import {
  scanReceipt,
  listAvailableModels,
  CANDIDATE_MODELS
} from '../modules/vision.js';

// DOM Selectors and Utilities
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
const esc = str => String(str ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[c]));

// React mount used by the legacy workflow controller during incremental migration.
let legacyViewRoot = null;

function mountLegacyView(ViewComponent, markup) {
  const host = $('#legacy-react-root');
  if (!host) throw new Error('Legacy React mount node was not found.');
  if (!legacyViewRoot) legacyViewRoot = createRoot(host);
  flushSync(() => legacyViewRoot.render(<ViewComponent markup={markup} />));
}

// Application State
let rosters = getRosters();
let recent = getRecent();
let settings = getSettings();
let view = 'dashboard';
let activeGroup = rosters[0] || null;
let outingSession = null;
let previousUnrolls = []; // Stack for undo unroll
let importedClaims = [];
let pendingAmbiguityAction = null;
let recognitionInstance = null;


// Toast Notification
function toast(message, isError = false) {
  const container = $('#toast-region');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast${isError ? ' error' : ''}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// Router
function go(targetView) {
  view = targetView;
  render();
  window.dispatchEvent(new CustomEvent('splitsmart:viewchange', { detail: { view: targetView } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setNav() {
  $$('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.view === view);
  });
  const titles = {
    dashboard: 'Overview',
    groups: 'Group Roster',
    bill: 'Bill & Receipt Entry',
    assign: 'Assign Items',
    breakdown: 'Individual Shares',
    settlements: 'Settle Up',
    settings: 'Settings',
    claim: 'Claim Your Items'
  };
  const title = titles[view] || 'SplitSmart';
  const bc = $('#breadcrumb');
  if (bc) bc.textContent = title;
  document.title = `${title} — SplitSmart`;
  window.dispatchEvent(new CustomEvent('splitsmart:viewchange', { detail: { view } }));
}

// Safe Group Member Access
function members() {
  return activeGroup?.members || [];
}

// Outing Session Initialization
function initOuting(group) {
  activeGroup = group || rosters[0] || freshRoster('My Outing', 4);
  outingSession = {
    id: uid('outing'),
    name: 'Dinner Outing',
    groupId: activeGroup.id,
    bills: [
      {
        id: uid('bill'),
        restaurantName: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
        items: [
          { id: uid('item'), name: '', quantity: 1, unitPaise: 0, totalPaise: 0, category: 'ANY', assignments: [] }
        ],
        tax: { cgst: 0, sgst: 0, serviceCharge: 0 },
        discount: 0,
        statedTotal: null,
        payers: []
      }
    ]
  };
  previousUnrolls = [];
  importedClaims = [];
  go('bill');
}

// Header HTML Helper
function renderHeader(title, subtitle, actionsHtml = '') {
  return `
    <div class="page-head">
      <div>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
      ${actionsHtml ? `<div class="head-actions">${actionsHtml}</div>` : ''}
    </div>
  `;
}

/* ==========================================================================
   VIEW 1: DASHBOARD
   ========================================================================== */
function renderDashboard() {
  const markup = buildDashboardMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(DashboardView, markup);
}

/* ==========================================================================
   VIEW 2: GROUPS MANAGER
   ========================================================================== */
function renderGroups() {
  const markup = buildGroupsMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(GroupsView, markup);
}

/* ==========================================================================
   VIEW 3: BILL CREATION
   ========================================================================== */
function currentBill() {
  if (!outingSession || !outingSession.bills.length) return null;
  return outingSession.bills[0];
}

function renderBill() {
  const markup = buildBillMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(BillView, markup);
}

function syncBillFromDom() {
  const bill = currentBill();
  if (!bill) return;

  const restInput = $('#bill-restaurant');
  const dateInput = $('#bill-date');
  const notesInput = $('#bill-notes');
  const cgstInput = $('#tax-cgst');
  const sgstInput = $('#tax-sgst');
  const scInput = $('#tax-sc');
  const discInput = $('#bill-discount');
  const statedInput = $('#stated-total');

  if (restInput) bill.restaurantName = restInput.value.trim();
  if (dateInput) bill.date = dateInput.value;
  if (notesInput) bill.notes = notesInput.value.trim();
  if (cgstInput) bill.tax.cgst = Number(cgstInput.value) || 0;
  if (sgstInput) bill.tax.sgst = Number(sgstInput.value) || 0;
  if (scInput) bill.tax.serviceCharge = Number(scInput.value) || 0;
  if (discInput) bill.discount = Number(discInput.value) || 0;
  if (statedInput) {
    bill.statedTotal = statedInput.value.trim() !== '' ? Number(statedInput.value) : null;
  }

  // Sync Item Rows (only if currently on bill entry view)
  const rows = $$('.item-entry');
  if (rows.length > 0) {
    bill.items = Array.from(rows).map((row, idx) => {
      const existing = bill.items[idx] || {};
      const name = row.querySelector('[data-field="name"]')?.value.trim() || '';
      const quantity = Number(row.querySelector('[data-field="quantity"]')?.value) || 1;
      const unitPrice = Number(row.querySelector('[data-field="unitPrice"]')?.value) || 0;
      const category = row.querySelector('[data-field="category"]')?.value || 'ANY';
      const unitPaise = toPaise(unitPrice);
      const totalPaise = Math.round(unitPaise * quantity);

      return {
        id: existing.id || uid('item'),
        name,
        quantity,
        unitPaise,
        totalPaise,
        category,
        assignments: existing.assignments || []
      };
    });
  }
}

/* ==========================================================================
   VIEW 4: ITEM ASSIGNMENT
   ========================================================================== */
let assignmentDietFilter = 'ALL';
let assignmentSearchQuery = '';

/** Values and actions consumed by the isolated legacy screen modules. */
function getViewContext() {
  return {
    recent, rosters, settings, activeGroup, previousUnrolls,
    assignmentDietFilter, assignmentSearchQuery,
    get decodedClaimPayload() { return decodedClaimPayload; },
    set decodedClaimPayload(value) { decodedClaimPayload = value; },
    templates, esc, formatCurrency, toPaise, renderHeader,
    currentBill, initOuting, members, go, computeBillShares,
    netBalances, minimumCashFlow, isValidUpiId, paymentUri, decodeShare,
  };
}


function renderAssign() {
  const markup = buildAssignmentMarkup(getViewContext());
  if (typeof markup === 'string') {
    mountLegacyView(AssignmentView, markup);
    attachDragAndDrop();
  }
}

function attachDragAndDrop() {
  let draggedMemberId = null;

  $$('.chip[draggable="true"]').forEach(chip => {
    chip.addEventListener('dragstart', e => {
      draggedMemberId = chip.dataset.memberId;
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/plain', draggedMemberId);
      e.dataTransfer.effectAllowed = 'copy';
    });

    chip.addEventListener('dragend', () => {
      chip.classList.remove('dragging');
      draggedMemberId = null;
    });
  });

  $$('.assignment-item').forEach(itemCard => {
    itemCard.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      itemCard.classList.add('drop-target');
    });

    itemCard.addEventListener('dragleave', () => {
      itemCard.classList.remove('drop-target');
    });

    itemCard.addEventListener('drop', e => {
      e.preventDefault();
      itemCard.classList.remove('drop-target');
      const memberId = e.dataTransfer.getData('text/plain') || draggedMemberId;
      const itemId = itemCard.dataset.itemId;

      if (memberId && itemId) {
        toggleItemAssignment(itemId, memberId);
      }
    });
  });
}

function toggleItemAssignment(itemId, memberId) {
  const bill = currentBill();
  if (!bill) return;
  const item = bill.items.find(i => i.id === itemId);
  if (!item) return;

  item.assignments = item.assignments || [];
  if (item.assignments.includes(memberId)) {
    item.assignments = item.assignments.filter(id => id !== memberId);
  } else {
    item.assignments.push(memberId);
  }
  renderAssign();
}

/* ==========================================================================
   VIEW 5: INDIVIDUAL BREAKDOWN & PAYER RECORDING
   ========================================================================== */
function computeBillShares() {
  const bill = currentBill();
  if (!bill) return null;

  const groupMembers = members();
  const tax = {
    cgst: toPaise(bill.tax.cgst),
    sgst: toPaise(bill.tax.sgst),
    serviceCharge: toPaise(bill.tax.serviceCharge)
  };
  const discountPaise = toPaise(bill.discount);
  const items = bill.items || [];

  const shares = calculateShares(items, groupMembers, tax, discountPaise);
  const foodTotal = items.reduce((a, b) => a + b.totalPaise, 0);
  const totalTax = tax.cgst + tax.sgst + tax.serviceCharge;
  const grandTotal = Math.max(0, foodTotal + totalTax - discountPaise);

  return {
    bill,
    items,
    members: groupMembers,
    foodTotal,
    taxTotal: totalTax,
    discountTotal: discountPaise,
    grandTotal,
    shares
  };
}

function renderBreakdown() {
  const markup = buildBreakdownMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(BreakdownView, markup);
}

// Live Summary for Payer Inputs (Runs without re-rendering or stealing input focus)
function updateLivePayerSummary() {
  const inputs = $$('.payer-amount-input');
  const calc = computeBillShares();
  if (!calc || !inputs.length) return;

  let totalPaise = 0;
  inputs.forEach(inp => {
    totalPaise += toPaise(inp.value);
  });

  const diffPaise = calc.grandTotal - totalPaise;
  const balanced = (diffPaise === 0);

  const totEl = $('#payer-total-display');
  if (totEl) totEl.textContent = formatCurrency(totalPaise);

  const msgEl = $('#payer-status-msg');
  if (msgEl) {
    if (balanced) {
      msgEl.innerHTML = `
        <div class="success" style="font-size:12.5px;padding:8px 12px;margin-top:8px;">
          ✓ Total paid matches bill total (${formatCurrency(calc.grandTotal)}). Click "Update Calculations" to apply.
        </div>
      `;
    } else {
      msgEl.innerHTML = `
        <div class="warning" style="font-size:12.5px;margin-top:8px;">
          Recorded payments (${formatCurrency(totalPaise)}) must equal the bill grand total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diffPaise))}. Click "Update Calculations" when ready.
        </div>
      `;
    }
  }
}

// Explicit Commit for Payer Amounts (Recalculates shares and net balances)
function applyPayerAmounts(showToast = true) {
  const b = currentBill();
  const calc = computeBillShares();
  if (!b || !calc) return false;

  const inputs = $$('.payer-amount-input');
  if (!inputs.length) return true;

  const newPayers = [];
  let totalPaid = 0;

  inputs.forEach(inp => {
    const mid = inp.dataset.memberId;
    const amt = toPaise(inp.value);
    if (amt > 0) {
      newPayers.push({ memberId: mid, amountPaise: amt });
      totalPaid += amt;
    }
  });

  b.payers = newPayers;

  const diff = calc.grandTotal - totalPaid;
  if (diff !== 0) {
    if (showToast) {
      toast(`⚠️ Payments recorded (${formatCurrency(totalPaid)}) do not equal the bill total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diff))}.`, true);
    }
  } else {
    if (showToast) {
      toast('✓ Payments updated and calculations balanced!');
    }
  }

  renderBreakdown();
  return diff === 0;
}

/* ==========================================================================
   VIEW 6: SETTLEMENTS & UPI QR
   ========================================================================== */
function renderSettlements() {
  const markup = buildSettlementsMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(SettlementsView, markup);
}

/* ==========================================================================
   VIEW 7: SETTINGS
   ========================================================================== */
function renderSettings() {
  const markup = buildSettingsMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(SettingsView, markup);
}

/* ==========================================================================
   VIEW 8: STATELESS SELF-CLAIM (DIRECT LINK OPEN)
   ========================================================================== */
let decodedClaimPayload = null;

function renderClaim() {
  const markup = buildClaimMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(ClaimView, markup);
}

/* ==========================================================================
   ROUTER DISPATCHER
   ========================================================================== */
function render() {
  setNav();
  if (window.location.hash.startsWith('#data=')) {
    view = 'claim';
    renderClaim();
    return;
  }

  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'groups': renderGroups(); break;
    case 'bill': renderBill(); break;
    case 'assign': renderAssign(); break;
    case 'breakdown': renderBreakdown(); break;
    case 'settlements': renderSettlements(); break;
    case 'settings': renderSettings(); break;
    default: renderDashboard();
  }
}

/* ==========================================================================
   NATURAL LANGUAGE COMMAND PARSER (100% INLINE DETERMINISTIC)
   ========================================================================== */
function executeNaturalLanguageCommand(text) {
  if (!text || !text.trim()) return;
  const bill = currentBill();
  if (!bill) return;

  const raw = text.trim();
  const lower = raw.toLowerCase();
  const items = bill.items || [];
  const groupMembers = members();

  // Pattern 1: Clear all
  if (lower === 'clear all' || lower === 'reset all') {
    items.forEach(i => i.assignments = []);
    toast('Cleared all item assignments.');
    renderAssign();
    return;
  }

  // Pattern 2: Clear item X
  const clearMatch = lower.match(/^clear\s+(?:assignment\s+(?:for\s+)?)?(?:item\s+)?(.+)$/);
  if (clearMatch) {
    const targetStr = clearMatch[1].trim();
    const itemNum = parseInt(targetStr, 10);
    const targetItem = !isNaN(itemNum) ? items[itemNum - 1] : items.find(i => i.name.toLowerCase().includes(targetStr));
    if (targetItem) {
      targetItem.assignments = [];
      toast(`Cleared assignments for "${targetItem.name}".`);
      renderAssign();
    } else {
      toast(`No item matching "${targetStr}" found.`, true);
    }
    return;
  }

  // Pattern 3: Assign / Put / Split <item> to/on/between <target>
  const assignMatch = lower.match(/^(?:assign|put|split)\s+(.+?)\s+(?:to|on|between)\s+(.+)$/);
  if (!assignMatch) {
    toast('Command not recognized. Example: "Assign naan to everyone" or "Put biryani on Sneha"', true);
    return;
  }

  const itemQuery = assignMatch[1].trim();
  const targetQuery = assignMatch[2].trim();

  // Resolve item
  let targetItem = null;
  const itemNum = parseInt(itemQuery.replace(/^item\s+/, ''), 10);
  if (!isNaN(itemNum) && items[itemNum - 1]) {
    targetItem = items[itemNum - 1];
  } else {
    const matchingItems = items.filter(i => i.name.toLowerCase().includes(itemQuery));
    if (matchingItems.length === 0) {
      toast(`No item found matching "${itemQuery}".`, true);
      return;
    } else if (matchingItems.length > 1) {
      // Ambiguous item match
      showAmbiguityDialog(
        `Multiple items matched "${itemQuery}". Please choose one:`,
        matchingItems.map(i => ({ label: `${i.name} (Qty ${i.quantity})`, value: i.id })),
        selectedId => {
          const itm = items.find(i => i.id === selectedId);
          if (itm) applyAssignmentToItem(itm, targetQuery);
        }
      );
      return;
    }
    targetItem = matchingItems[0];
  }

  applyAssignmentToItem(targetItem, targetQuery);
}

function applyAssignmentToItem(item, targetQuery) {
  const groupMembers = members();
  let assignees = [];

  if (targetQuery === 'everyone' || targetQuery === 'everybody' || targetQuery === 'all') {
    assignees = groupMembers.map(m => m.id);
  } else if (targetQuery === 'veg' || targetQuery === 'vegetarians') {
    assignees = groupMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
  } else if (targetQuery === 'non-veg' || targetQuery === 'nonveg') {
    assignees = groupMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
  } else if (targetQuery.includes(' and ')) {
    const names = targetQuery.split(' and ').map(s => s.trim());
    names.forEach(n => {
      const match = groupMembers.find(m => m.name.toLowerCase().includes(n));
      if (match) assignees.push(match.id);
    });
  } else {
    const matches = groupMembers.filter(m => m.name.toLowerCase().includes(targetQuery));
    if (matches.length === 0) {
      toast(`No group member found matching "${targetQuery}".`, true);
      return;
    } else if (matches.length > 1) {
      showAmbiguityDialog(
        `Multiple members matched "${targetQuery}". Select one:`,
        matches.map(m => ({ label: m.name, value: m.id })),
        selectedId => {
          item.assignments = [selectedId];
          toast(`Assigned ${item.name} to ${matches.find(m => m.id === selectedId)?.name}.`);
          renderAssign();
        }
      );
      return;
    }
    assignees = [matches[0].id];
  }

  if (assignees.length === 0) {
    toast('No eligible members matched.', true);
    return;
  }

  item.assignments = [...new Set(assignees)];
  toast(`Assigned "${item.name}" to ${assignees.map(id => groupMembers.find(m => m.id === id)?.name).join(', ')}.`);
  renderAssign();
}

function showAmbiguityDialog(prompt, choices, onSelect) {
  $('#ambiguity-prompt').textContent = prompt;
  const container = $('#ambiguity-choices');
  container.innerHTML = choices.map(c => `
    <button type="button" class="button button-secondary" data-choice-val="${esc(c.value)}" style="width:100%;justify-content:flex-start;margin-bottom:8px;">
      ${esc(c.label)}
    </button>
  `).join('');

  pendingAmbiguityAction = onSelect;
  $('#ambiguity-dialog').showModal();
}

/* ==========================================================================
   EVENT DELEGATION AND ACTION DISPATCH
   ========================================================================== */
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
    $('#sidebar').classList.remove('open');
    return;
  }

  // Ambiguity choice
  const choiceBtn = e.target.closest('[data-choice-val]');
  if (choiceBtn && pendingAmbiguityAction) {
    const val = choiceBtn.dataset.choiceVal;
    $('#ambiguity-dialog').close();
    pendingAmbiguityAction(val);
    pendingAmbiguityAction = null;
    return;
  }

  // Actions
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;

  switch (action) {

    case 'new-bill': {
      initOuting(activeGroup);
      break;
    }

    case 'use-group-bill': {
      const g = rosters.find(x => x.id === actionBtn.dataset.id);
      if (g) initOuting(g);
      break;
    }

    case 'create-group': {
      const name = prompt('Enter group name (e.g. Goa Trip, Flat 402):');
      if (name && name.trim()) {
        const g = freshRoster(name.trim(), 4);
        rosters.push(g);
        saveRosters(rosters);
        toast(`Group "${g.name}" created.`);
        renderGroups();
      }
      break;
    }

    case 'add-template': {
      const name = actionBtn.dataset.name;
      const count = Number(actionBtn.dataset.count) || 4;
      const g = freshRoster(name, count);
      rosters.push(g);
      saveRosters(rosters);
      toast(`Template "${g.name}" added to groups.`);
      renderGroups();
      break;
    }

    case 'rename-group': {
      const g = rosters.find(x => x.id === actionBtn.dataset.id);
      if (g) {
        const newName = prompt('Rename group:', g.name);
        if (newName && newName.trim()) {
          g.name = newName.trim().slice(0, 80);
          saveRosters(rosters);
          renderGroups();
        }
      }
      break;
    }

    case 'delete-group': {
      const id = actionBtn.dataset.id;
      if (confirm('Delete this group and its member profiles?')) {
        rosters = rosters.filter(x => x.id !== id);
        saveRosters(rosters);
        if (activeGroup?.id === id) activeGroup = rosters[0] || null;
        toast('Group deleted.');
        renderGroups();
      }
      break;
    }

    case 'add-member': {
      openMemberModal(actionBtn.dataset.group, null);
      break;
    }

    case 'edit-member': {
      openMemberModal(actionBtn.dataset.group, actionBtn.dataset.id);
      break;
    }

    case 'delete-member': {
      const gid = actionBtn.dataset.group;
      const mid = actionBtn.dataset.id;
      const g = rosters.find(x => x.id === gid);
      if (g && confirm('Remove this member profile?')) {
        g.members = g.members.filter(m => m.id !== mid);
        saveRosters(rosters);
        renderGroups();
      }
      break;
    }

    case 'close-member': {
      $('#member-dialog').close();
      break;
    }

    case 'add-item-row': {
      syncBillFromDom();
      const b = currentBill();
      if (b) {
        b.items.push({ id: uid('item'), name: '', quantity: 1, unitPaise: 0, totalPaise: 0, category: 'ANY', assignments: [] });
        renderBill();
      }
      break;
    }

    case 'remove-item': {
      syncBillFromDom();
      const b = currentBill();
      const idx = Number(actionBtn.dataset.idx);
      if (b && b.items.length > 1) {
        b.items.splice(idx, 1);
        renderBill();
      } else {
        toast('A bill must have at least one item.', true);
      }
      break;
    }

    case 'sync-calculated-total': {
      const b = currentBill();
      if (b) {
        b.statedTotal = null;
        renderBill();
        toast('Synchronized to calculated total.');
      }
      break;
    }

    case 'go-to-assign': {
      syncBillFromDom();
      const b = currentBill();
      if (!b || !b.items.length) {
        toast('Please add at least one item.', true);
        return;
      }
      if (b.items.some(i => !i.name.trim())) {
        toast('Please provide a name for every item.', true);
        return;
      }
      if (members().length === 0) {
        toast('Please add members to the group before assigning.', true);
        go('groups');
        return;
      }
      go('assign');
      break;
    }

    case 'back-to-bill': {
      go('bill');
      break;
    }

    case 'toggle-assignment': {
      const itemId = actionBtn.dataset.itemId;
      const memberId = actionBtn.dataset.memberId;
      toggleItemAssignment(itemId, memberId);
      break;
    }

    case 'auto-split-diet': {
      const b = currentBill();
      if (!b) return;
      const gMembers = members();

      let changed = 0;
      b.items.forEach(item => {
        if (item.category === 'VEG') {
          const eligible = gMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
          if (eligible.length) { item.assignments = eligible; changed++; }
        } else if (item.category === 'NON-VEG') {
          const eligible = gMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
          if (eligible.length) { item.assignments = eligible; changed++; }
        }
      });

      toast(`Dietary preferences applied to ${changed} item(s).`);
      renderAssign();
      break;
    }

    case 'split-remaining-equally': {
      const b = currentBill();
      if (!b) return;
      const allIds = members().map(m => m.id);
      let count = 0;
      b.items.forEach(item => {
        if (!item.assignments || item.assignments.length === 0) {
          item.assignments = [...allIds];
          count++;
        }
      });
      toast(`Split ${count} unassigned item(s) equally across all members.`);
      renderAssign();
      break;
    }

    case 'unroll-single': {
      const b = currentBill();
      const idx = Number(actionBtn.dataset.idx);
      if (b && b.items[idx]) {
        const original = b.items[idx];
        const unrolled = unrollItem(original);
        if (unrolled) {
          previousUnrolls.push({ type: 'single', original, items: unrolled });
          b.items.splice(idx, 1, ...unrolled);
          toast(`Unrolled "${original.name}" into ${unrolled.length} units.`);
          renderAssign();
        }
      }
      break;
    }

    case 'unroll-all': {
      const b = currentBill();
      if (!b) return;
      let unrolledAny = false;
      const nextItems = [];
      const unrollHistory = [];

      b.items.forEach(item => {
        const res = unrollItem(item);
        if (res) {
          unrolledAny = true;
          unrollHistory.push({ original: item, unrolled: res });
          nextItems.push(...res);
        } else {
          nextItems.push(item);
        }
      });

      if (unrolledAny) {
        previousUnrolls.push({ type: 'batch', records: unrollHistory });
        b.items = nextItems;
        toast('All quantities unrolled into individual units.');
        renderAssign();
      } else {
        toast('No items with quantity > 1 found to unroll.');
      }
      break;
    }

    case 'undo-unroll': {
      const b = currentBill();
      if (!b || !previousUnrolls.length) return;
      const last = previousUnrolls.pop();

      if (last.type === 'single') {
        b.items = undoUnrollItem(b.items, last.original);
      } else if (last.type === 'batch') {
        last.records.forEach(rec => {
          b.items = undoUnrollItem(b.items, rec.original);
        });
      }
      toast('Undo unroll completed.');
      renderAssign();
      break;
    }

    case 'run-command': {
      const input = $('#command-input');
      if (input) {
        executeNaturalLanguageCommand(input.value);
        input.value = '';
      }
      break;
    }

    case 'voice-command': {
      handleVoiceCommand();
      break;
    }

    case 'filter-diet': {
      assignmentDietFilter = actionBtn.dataset.filter;
      renderAssign();
      break;
    }

    case 'go-to-breakdown': {
      go('breakdown');
      break;
    }

    case 'back-to-assign': {
      go('assign');
      break;
    }

    case 'set-first-payer': {
      const b = currentBill();
      const calc = computeBillShares();
      if (b && calc && members().length) {
        const first = members()[0];
        b.payers = [{ memberId: first.id, amountPaise: calc.grandTotal }];
        renderBreakdown();
        toast(`${first.name} set as full payer.`);
      }
      break;
    }

    case 'split-payers-equally': {
      const b = currentBill();
      const calc = computeBillShares();
      if (b && calc && members().length) {
        const gMembers = members();
        const n = gMembers.length;
        const base = Math.floor(calc.grandTotal / n);
        const rem = calc.grandTotal % n;
        b.payers = gMembers.map((m, i) => ({
          memberId: m.id,
          amountPaise: base + (i < rem ? 1 : 0)
        }));
        renderBreakdown();
        toast('Bill payments divided equally across all members.');
      }
      break;
    }

    case 'apply-payers': {
      applyPayerAmounts(true);
      break;
    }

    case 'fill-remaining-payer': {
      const mid = actionBtn.dataset.memberId;
      const calc = computeBillShares();
      if (!calc) return;

      const inputs = $$('.payer-amount-input');
      let otherSum = 0;
      inputs.forEach(inp => {
        if (inp.dataset.memberId !== mid) {
          otherSum += toPaise(inp.value);
        }
      });

      const remainder = Math.max(0, calc.grandTotal - otherSum);
      const targetInp = $(`.payer-amount-input[data-member-id="${mid}"]`);
      if (targetInp) {
        targetInp.value = (remainder / 100).toFixed(2);
      }

      applyPayerAmounts(true);
      break;
    }

    case 'quick-split-unassigned': {
      const b = currentBill();
      if (!b) return;
      const allIds = members().map(m => m.id);
      let count = 0;
      b.items.forEach(item => {
        if (!item.assignments || item.assignments.length === 0) {
          item.assignments = [...allIds];
          count++;
        }
      });
      renderBreakdown();
      toast(`✓ Assigned ${count} unassigned item(s) equally across all group members.`);
      break;
    }

    case 'finalize-settlement': {
      const b = currentBill();
      const calc = computeBillShares();
      if (!b || !calc) return;

      // 1. Commit any currently typed payer amounts in input fields
      applyPayerAmounts(false);

      // 2. Re-compute after committing inputs
      const updatedCalc = computeBillShares();
      const updatedBill = updatedCalc.bill;
      const unassigned = updatedCalc.items.filter(i => !i.assignments || i.assignments.length === 0);

      if (unassigned.length > 0) {
        toast(`⚠️ Cannot generate settlement plan: ${unassigned.length} item(s) are unassigned! Please assign or split them first.`, true);
        const banner = $('#unassigned-banner');
        if (banner) {
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          banner.style.boxShadow = '0 0 0 3px var(--warning)';
          setTimeout(() => { if (banner) banner.style.boxShadow = ''; }, 2500);
        }
        return;
      }

      const totalPaidPaise = (updatedBill.payers || []).reduce((acc, p) => acc + (p.amountPaise || 0), 0);
      const diff = updatedCalc.grandTotal - totalPaidPaise;
      if (diff !== 0) {
        toast(`⚠️ Recorded payments (${formatCurrency(totalPaidPaise)}) must equal the bill grand total (${formatCurrency(updatedCalc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diff))}.`, true);
        const aside = $('#payers-panel');
        if (aside) {
          aside.scrollIntoView({ behavior: 'smooth', block: 'center' });
          aside.style.boxShadow = '0 0 0 3px var(--danger)';
          setTimeout(() => { if (aside) aside.style.boxShadow = ''; }, 2500);
        }
        return;
      }

      saveCurrentOutingToRecent();
      go('settlements');
      toast('✓ Settlement plan generated successfully!');
      break;
    }

    case 'open-qr': {
      const idx = Number(actionBtn.dataset.idx);
      openQRModal(idx);
      break;
    }

    case 'close-qr': {
      $('#qr-dialog').close();
      break;
    }

    case 'copy-payment-note': {
      const idx = Number(actionBtn.dataset.idx);
      copyPaymentDetails(idx);
      break;
    }

    case 'split-threshold': {
      const idx = Number(actionBtn.dataset.idx);
      openSplitThresholdModal(idx);
      break;
    }

    case 'close-split': {
      $('#split-dialog').close();
      break;
    }

    case 'close-share-dialog': {
      $('#share-dialog')?.close();
      break;
    }

    case 'share-claim-link': {
      shareClaimUrl();
      break;
    }

    case 'import-claim-modal': {
      promptImportClaim();
      break;
    }

    case 'submit-whatsapp-claim': {
      generateWhatsAppClaim();
      break;
    }

    case 'save-api-key': {
      const keyInput = $('#gemini-key-input');
      const saveBox = $('#save-key-checkbox');
      const modelSelect = $('#gemini-model-select');
      if (keyInput && saveBox) {
        settings.apiKey = keyInput.value.trim();
        settings.saveKey = saveBox.checked;
        settings.selectedModel = modelSelect?.value || 'auto';
        saveSettings(settings);
        toast('Gemini settings updated.');
      }
      break;
    }

    case 'test-api-key': {
      const keyInput = $('#gemini-key-input');
      const key = keyInput?.value.trim() || settings.apiKey;
      const resultBox = $('#test-key-result');
      if (!key) {
        toast('Enter an API key to test.', true);
        return;
      }
      if (resultBox) resultBox.innerHTML = '<span class="quiet">Testing connection to Google Gemini API…</span>';
      try {
        const available = await listAvailableModels(key);
        if (resultBox) {
          resultBox.innerHTML = `
            <div class="success">
              ✓ <strong>Valid API Key!</strong> Connection to Gemini API succeeded.<br>
              <span class="quiet" style="font-size:12px;">Available models on your account: ${available.slice(0, 6).map(m => `<code>${esc(m)}</code>`).join(', ')}${available.length > 6 ? ` (+${available.length - 6} more)` : ''}</span>
            </div>
          `;
        }
      } catch (err) {
        if (resultBox) {
          resultBox.innerHTML = `
            <div class="warning">
              ✗ <strong>Connection failed:</strong> ${esc(err.message)}
            </div>
          `;
        }
      }
      break;
    }

    case 'clear-api-key': {
      settings.apiKey = '';
      settings.saveKey = false;
      saveSettings(settings);
      toast('Saved Gemini API key removed.');
      renderSettings();
      break;
    }

    case 'export-backup': {
      const backup = exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `splitsmart-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('JSON backup exported.');
      break;
    }

    case 'clear-history': {
      if (confirm('Clear your recent bill history?')) {
        recent = [];
        saveRecent(recent);
        toast('Recent bills cleared.');
        renderDashboard();
      }
      break;
    }

    case 'wipe-all-data': {
      if (confirm('Permanently wipe all SplitSmart groups, history, and settings from this device?')) {
        localStorage.clear();
        rosters = getRosters();
        recent = [];
        settings = getSettings();
        toast('All local data wiped.');
        go('dashboard');
      }
      break;
    }

    case 'run-financial-tests': {
      try {
        const res = runSelfTests();
        $('#test-results-output').innerHTML = `<span style="color:var(--success);">✓ ${esc(res)}</span>`;
      } catch (err) {
        $('#test-results-output').innerHTML = `<span style="color:var(--danger);">✗ Test failure: ${esc(err.message)}</span>`;
      }
      break;
    }

    case 'scan-receipt': {
      handleReceiptScan();
      break;
    }

    case 'reopen-bill': {
      const id = actionBtn.dataset.id;
      const rec = recent.find(r => r.id === id);
      if (rec && rec.session) {
        outingSession = rec.session;
        activeGroup = rec.group || rosters.find(g => g.id === rec.session.groupId) || rosters[0];
        toast(`Reopened "${rec.restaurantName}".`);
        go('breakdown');
      } else {
        toast('Could not restore full session for this bill.', true);
      }
      break;
    }

    case 'save-draft':
    case 'save-current-bill': {
      saveCurrentOutingToRecent();
      break;
    }

    case 'close-ambiguity': {
      $('#ambiguity-dialog').close();
      pendingAmbiguityAction = null;
      break;
    }
  }
});

// Member Form Modal
function openMemberModal(groupId, memberId) {
  const g = rosters.find(x => x.id === groupId);
  if (!g) return;
  const m = memberId ? g.members.find(x => x.id === memberId) : null;
  const form = $('#member-form');

  form.elements.id.value = m?.id || '';
  form.elements.name.value = m?.name || '';
  form.elements.upiId.value = m?.upiId || '';
  form.elements.dietaryTag.value = m?.dietaryTag || 'ANY';
  form.dataset.groupId = groupId;

  $('#member-dialog-title').textContent = m ? 'Edit Member' : 'Add Member';
  $('#member-dialog').showModal();
}

$('#member-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget;
  const gid = form.dataset.groupId;
  const g = rosters.find(x => x.id === gid);
  if (!g) return;

  const id = form.elements.id.value;
  const name = form.elements.name.value.trim();
  const upiId = form.elements.upiId.value.trim();
  const dietaryTag = form.elements.dietaryTag.value;

  if (!name) return;

  // Duplicate name check
  if (g.members.some(m => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
    toast(`A member named "${name}" already exists in this group.`, true);
    return;
  }

  if (id) {
    g.members = g.members.map(m => m.id === id ? { ...m, name, upiId, dietaryTag, example: false } : m);
    toast(`Updated "${name}".`);
  } else {
    if (g.members.length >= 30) {
      toast('Groups can have up to 30 members.', true);
      return;
    }
    g.members.push({ id: uid('person'), name, upiId, dietaryTag, example: false });
    toast(`Added "${name}".`);
  }

  saveRosters(rosters);
  $('#member-dialog').close();
  renderGroups();
});

// Primary Payer Selection from Groups view
document.addEventListener('change', e => {
  if (e.target.dataset.action === 'set-primary-payer') {
    const gid = e.target.dataset.group;
    const g = rosters.find(x => x.id === gid);
    if (g) {
      g.primaryPayerId = e.target.value || null;
      saveRosters(rosters);
      toast('Default payer updated for this group.');
    }
  }

  if (e.target.id === 'backup-file-input') {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        importBackup(parsed);
        rosters = getRosters();
        toast('Backup successfully restored!');
        renderGroups();
      } catch (err) {
        toast(err.message, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (e.target.matches('[data-search-group]')) {
    const gid = e.target.dataset.searchGroup;
    const q = e.target.value.toLowerCase();
    const list = $(`[data-member-list="${CSS.escape(gid)}"]`);
    if (list) {
      list.querySelectorAll('.list-row').forEach(row => {
        const name = row.querySelector('.list-row-main div')?.textContent.toLowerCase() || '';
        row.style.display = name.includes(q) ? '' : 'none';
      });
    }
  }
});

// Dynamic Item Line Total Calculations on Bill Input
document.addEventListener('input', e => {
  if (e.target.closest('.item-entry')) {
    const row = e.target.closest('.item-entry');
    const qty = Number(row.querySelector('[data-field="quantity"]')?.value) || 0;
    const unitPrice = Number(row.querySelector('[data-field="unitPrice"]')?.value) || 0;
    const lineTotalPaise = Math.round(toPaise(unitPrice) * qty);
    const disp = row.querySelector('.item-total-display');
    if (disp) disp.textContent = formatCurrency(lineTotalPaise);

    // Update food subtotal live
    updateBillTotalsLive();
  }

  if (['tax-cgst', 'tax-sgst', 'tax-sc', 'bill-discount', 'stated-total'].includes(e.target.id)) {
    updateBillTotalsLive();
  }

  if (e.target.matches('.payer-amount-input')) {
    updateLivePayerSummary();
  }

  if (e.target.id === 'assign-member-search') {
    assignmentSearchQuery = e.target.value;
    renderAssign();
  }
});

// Pressing Enter in payer amount input triggers calculation update
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.payer-amount-input')) {
    e.preventDefault();
    applyPayerAmounts(true);
  }
});

function updateBillTotalsLive() {
  const rows = $$('.item-entry');
  let foodPaise = 0;
  rows.forEach(r => {
    const q = Number(r.querySelector('[data-field="quantity"]')?.value) || 0;
    const u = Number(r.querySelector('[data-field="unitPrice"]')?.value) || 0;
    foodPaise += Math.round(toPaise(u) * q);
  });

  const cgst = toPaise($('#tax-cgst')?.value);
  const sgst = toPaise($('#tax-sgst')?.value);
  const sc = toPaise($('#tax-sc')?.value);
  const disc = toPaise($('#bill-discount')?.value);
  const grandPaise = Math.max(0, foodPaise + cgst + sgst + sc - disc);

  const foodEl = $('#food-subtotal-display');
  const grandEl = $('#grand-total-display');
  if (foodEl) foodEl.textContent = formatCurrency(foodPaise);
  if (grandEl) grandEl.textContent = formatCurrency(grandPaise);
}

// Receipt Scanning Handler
async function handleReceiptScan() {
  const fileInput = $('#receipt-upload');
  const file = fileInput?.files?.[0];
  if (!file) {
    toast('Please select or capture a receipt image first.', true);
    return;
  }

  if (!settings.apiKey) {
    toast('Please configure your Gemini API key in Settings first.', true);
    go('settings');
    return;
  }

  const btn = $('#scan-btn');
  const spinner = $('#scan-spinner');
  const statusBox = $('#scan-status');

  btn.disabled = true;
  if (spinner) spinner.style.display = 'inline';
  statusBox.innerHTML = '<span class="quiet">Compressing image client-side…</span>';

  try {
    const onProgress = (msg) => {
      if (statusBox) statusBox.innerHTML = `<span class="quiet">${esc(msg)}</span>`;
    };

    const receipt = await scanReceipt(file, settings.apiKey, settings.selectedModel || 'auto', onProgress);
    const b = currentBill();
    if (b) {
      b.restaurantName = receipt.restaurantName;
      b.tax = { ...receipt.tax };
      b.discount = receipt.discount;
      b.statedTotal = receipt.statedGrandTotal;
      b.items = receipt.items.map(it => ({
        id: uid('item'),
        name: it.name,
        quantity: it.quantity,
        unitPaise: toPaise(it.unitPrice),
        totalPaise: Math.round(toPaise(it.unitPrice) * it.quantity),
        category: it.category,
        assignments: []
      }));
      toast(`Receipt scanned successfully using ${receipt.modelUsed || 'Gemini'}! Review extracted items.`);
      renderBill();
    }
  } catch (err) {
    statusBox.innerHTML = `<div class="warning">⚠️ ${esc(err.message)} You can also enter items manually.</div>`;
  } finally {
    btn.disabled = false;
    if (spinner) spinner.style.display = 'none';
  }
}

// Voice Command Handler (Web Speech API)
function handleVoiceCommand() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    toast('Web Speech API is not supported in this browser. Please type your command.', true);
    return;
  }

  if (recognitionInstance) {
    recognitionInstance.stop();
    recognitionInstance = null;
    return;
  }

  recognitionInstance = new SpeechRecognition();
  recognitionInstance.lang = 'en-IN';
  recognitionInstance.interimResults = false;
  recognitionInstance.maxAlternatives = 1;

  const micBtn = $('#mic-btn');
  if (micBtn) micBtn.textContent = '🔴 Listening…';

  recognitionInstance.onresult = e => {
    const transcript = e.results[0][0].transcript;
    const input = $('#command-input');
    if (input) input.value = transcript;
    toast(`Heard: "${transcript}"`);
    executeNaturalLanguageCommand(transcript);
  };

  recognitionInstance.onerror = e => {
    toast(`Speech recognition error: ${e.error}`, true);
  };

  recognitionInstance.onend = () => {
    if (micBtn) micBtn.textContent = '🎤';
    recognitionInstance = null;
  };

  recognitionInstance.start();
}

// Save Current Outing to Recent History
function saveCurrentOutingToRecent() {
  syncBillFromDom();
  const calc = computeBillShares();
  if (!calc) return;

  const record = {
    id: outingSession.id,
    restaurantName: calc.bill.restaurantName || 'Shared Outing',
    date: calc.bill.date || new Date().toISOString().slice(0, 10),
    groupName: activeGroup?.name || 'Group',
    peopleCount: members().length,
    totalPaise: calc.grandTotal,
    group: activeGroup,
    session: outingSession
  };

  recent = [record, ...recent.filter(r => r.id !== record.id)].slice(0, 5);
  saveRecent(recent);
  toast('Bill saved to recent history.');
}

// QR Code Modal
function openQRModal(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const creditor = calc.members.find(m => m.id === st.creditor);
  const upiId = creditor?.upiId;
  if (!isValidUpiId(upiId)) {
    toast('Creditor does not have a valid UPI ID.', true);
    return;
  }

  const uri = paymentUri({
    upiId,
    name: st.creditorName,
    amountPaise: st.amountPaise,
    note: `SplitSmart - ${calc.bill.restaurantName || 'Bill'}`
  });

  const container = $('#modal-qr-container');
  renderQR(container, uri, 220);

  $('#qr-dialog-title').textContent = `Pay ${st.creditorName}`;
  $('#qr-dialog-details').innerHTML = `
    <div style="font-size:20px;font-weight:700;margin-bottom:8px;">${formatCurrency(st.amountPaise)}</div>
    <div class="quiet" style="font-size:13px;">Payer: <strong>${esc(st.debtorName)}</strong></div>
    <div class="quiet" style="font-size:13px;">UPI ID: <strong>${esc(upiId)}</strong></div>
    <div class="quiet" style="font-size:12px;margin-top:10px;">Scan using Google Pay, PhonePe, Paytm, or BHIM.</div>
  `;

  $('#modal-upi-link').href = uri;
  $('#qr-dialog').showModal();
}

// Copy Payment Note
function copyPaymentDetails(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const text = `${st.debtorName} owes ${st.creditorName} ${formatCurrency(st.amountPaise)} for ${calc.bill.restaurantName || 'outing'}.`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => toast('Payment details copied to clipboard.'))
      .catch(() => prompt('Copy payment details:', text));
  } else {
    prompt('Copy payment details:', text);
  }
}

// Large UPI Split Modal (> ₹2,000 threshold)
function openSplitThresholdModal(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const totalPaise = st.amountPaise;
  const parts2 = splitPayment(totalPaise, 2);
  const parts3 = splitPayment(totalPaise, 3);

  const container = $('#split-dialog-options');
  container.innerHTML = `
    <div class="panel" style="background:var(--surface-alt);margin-bottom:12px;">
      <strong>Option A: 2 equal transfers</strong>
      <div class="quiet" style="font-size:13px;margin:6px 0;">
        Part 1: ${formatCurrency(parts2[0])} · Part 2: ${formatCurrency(parts2[1])}
      </div>
    </div>
    <div class="panel" style="background:var(--surface-alt);margin-bottom:12px;">
      <strong>Option B: 3 transfers</strong>
      <div class="quiet" style="font-size:13px;margin:6px 0;">
        Part 1: ${formatCurrency(parts3[0])} · Part 2: ${formatCurrency(parts3[1])} · Part 3: ${formatCurrency(parts3[2])}
      </div>
    </div>
    <p class="quiet" style="font-size:12px;">All splits sum exactly to ${formatCurrency(totalPaise)}. Bank limits depend on your account tier and UPI provider.</p>
  `;

  $('#split-dialog').showModal();
}

// Share Claim URL
function shareClaimUrl() {
  const b = currentBill();
  if (!b || !b.items.length) {
    toast('Add items before sharing.', true);
    return;
  }

  try {
    const payload = makeSharePayload(b, members(), b.items);
    const link = encodeShare(payload);

    // Populate and display share modal dialog
    const dlg = $('#share-dialog');
    if (dlg) {
      $('#share-dialog-link').value = link;
      $('#share-dialog-open-btn').href = link;
      $('#share-dialog-wa-btn').href = `https://api.whatsapp.com/send?text=${encodeURIComponent(`Hey! Here is the SplitSmart bill for ${b.restaurantName || 'our outing'}. Please select the items you ordered: ` + link)}`;

      const copyBtn = $('#share-dialog-copy-btn');
      if (copyBtn) {
        copyBtn.textContent = 'Copy Link';
        copyBtn.onclick = () => {
          if (navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => {
              copyBtn.textContent = 'Copied!';
              toast('Link copied to clipboard!');
              setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
            }).catch(() => {
              $('#share-dialog-link').select();
              document.execCommand('copy');
              copyBtn.textContent = 'Copied!';
            });
          } else {
            $('#share-dialog-link').select();
            document.execCommand('copy');
            copyBtn.textContent = 'Copied!';
          }
        };
      }
      dlg.showModal();
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(link)
        .then(() => toast('Stateless self-claim link copied to clipboard!'))
        .catch(() => {});
    }
  } catch (err) {
    toast(err.message, true);
  }
}

// Generate WhatsApp Claim from Self-Claim Page
function generateWhatsAppClaim() {
  if (!decodedClaimPayload) return;
  const claimant = $('#claimant-name-select')?.value;
  if (!claimant) {
    toast('Please choose your name from the dropdown list.', true);
    return;
  }

  const checkedBoxes = $$('[data-claim-item]:checked');
  const claimedItemIds = Array.from(checkedBoxes).map(b => b.dataset.claimItem);

  if (claimedItemIds.length === 0) {
    toast('Please select at least one item you consumed.', true);
    return;
  }

  const claimMsg = claimMessage(decodedClaimPayload, claimant, claimedItemIds);
  const waUrl = whatsappUrl(claimMsg);

  $('#claim-result-box').innerHTML = `
    <div class="success" style="margin-bottom:14px;">
      Claim prepared for <strong>${esc(claimant)}</strong>! Send this message to your outing host on WhatsApp.
    </div>
    <textarea readonly style="font-family:var(--font-mono);font-size:12px;margin-bottom:12px;" rows="3">${esc(claimMsg)}</textarea>
    <a class="button button-primary" href="${esc(waUrl)}" target="_blank" rel="noopener" style="width:100%;">
      Open WhatsApp &amp; Send to Host
    </a>
  `;
}

// Prompt Host to Import WhatsApp Claim
function promptImportClaim() {
  const raw = prompt('Paste the full SPLITSMART_CLAIM message received from WhatsApp:');
  if (!raw || !raw.trim()) return;

  const b = currentBill();
  if (!b) return;

  try {
    const currentPayload = makeSharePayload(b, members(), b.items);
    const claim = parseClaim(raw.trim(), currentPayload, importedClaims);

    // Preview and confirm
    const itemNames = claim.itemIds.map(id => b.items.find(i => i.id === id)?.name || id).join(', ');
    if (confirm(`Import claim from ${claim.user} for:\n• ${itemNames}\n\nApply these assignments?`)) {
      const member = members().find(m => m.name === claim.user);
      if (member) {
        claim.itemIds.forEach(id => {
          const item = b.items.find(i => i.id === id);
          if (item) {
            item.assignments = item.assignments || [];
            if (!item.assignments.includes(member.id)) {
              item.assignments.push(member.id);
            }
          }
        });
        importedClaims.push(claim);
        toast(`Claim from ${claim.user} applied successfully!`);
        go('assign');
      }
    }
  } catch (err) {
    toast(err.message, true);
  }
}

// Hamburger Mobile Navigation Drawer Toggle
$('#menu-toggle')?.addEventListener('click', () => {
  $('#sidebar')?.classList.toggle('open');
});

// URL Hash Change Handler
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#data=')) {
    renderClaim();
  }
});

// Initial Mount
if (window.location.hash.startsWith('#data=')) {
  renderClaim();
} else {
  render();
}
