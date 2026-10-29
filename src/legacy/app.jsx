/**
 * SplitSmart application controller entry point.
 * Feature behavior is composed from focused JSX action modules under app/actions/.
 * This file retains app state, route rendering, and delegated event wiring.
 */

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { selectOne as $, selectAll as $$, escapeHtml as esc } from './app/core.jsx';
import { getViewTitle } from './app/router.jsx';
import { emitSplitSmartEvent } from './app/events.jsx';
import { installReceiptDropListeners } from './app/listeners.jsx';
import DashboardView, { buildDashboardMarkup } from './app/views/dashboard.jsx';
import GroupsView, { buildGroupsMarkup } from './app/views/groups.jsx';
import BillView, { buildBillMarkup } from './app/views/bill.jsx';
import AssignmentView, { buildAssignmentMarkup } from './app/views/assign.jsx';
import BreakdownView, { buildBreakdownMarkup } from './app/views/breakdown.jsx';
import SettlementsView, { buildSettlementsMarkup } from './app/views/settlements.jsx';
import SettingsView, { buildSettingsMarkup } from './app/views/settings.jsx';
import ClaimView, { buildClaimMarkup } from './app/views/claim.jsx';

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
} from './state.jsx';

import {
  toPaise,
  formatCurrency,
  unrollItem,
  undoUnrollItem,
  calculateShares,
  netBalances,
  minimumCashFlow,
  runSelfTests,
} from './algorithm.jsx';

import { paymentUri, renderQR, splitPayment, isValidUpiId } from './qr.jsx';

import { decodeShare } from './share.jsx';

import { scanReceipt, listAvailableModels } from './vision.jsx';
import { GEMINI_API_KEY, GEMINI_CONFIGURED } from '../config/gemini.jsx';
import { createBillingController } from './app/actions/bill.jsx';
import { createAssignmentController } from './app/actions/assign.jsx';
import { createReceiptController } from './app/actions/general.jsx';
import { createSettlementController } from './app/actions/settlement.jsx';
import { createClaimsController } from './app/actions/claims.jsx';

import {
  installInlineValidation,
  validateFields,
  validateField,
  validateFileInput,
  setFieldValidationError,
  clearFieldValidation,
} from '../config/formBridge.jsx';

// Install shared blur/input/change validation for dynamically-rendered controls.
installInlineValidation();

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
  emitSplitSmartEvent('splitsmart:viewchange', { view: targetView });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setNav() {
  $$('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === view);
  });
  const title = getViewTitle(view);
  const bc = $('#breadcrumb');
  if (bc) bc.textContent = title;
  document.title = `${title} — SplitSmart`;
  emitSplitSmartEvent('splitsmart:viewchange', { view });
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
          {
            id: uid('item'),
            name: '',
            quantity: 1,
            unitPaise: 0,
            totalPaise: 0,
            category: 'ANY',
            assignments: [],
          },
        ],
        tax: { cgst: 0, sgst: 0, serviceCharge: 0 },
        discount: 0,
        statedTotal: null,
        payers: [],
      },
    ],
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



/* ==========================================================================
   VIEW 4: ITEM ASSIGNMENT
   ========================================================================== */
let assignmentDietFilter = 'ALL';
let assignmentSearchQuery = '';

/** Values and actions consumed by the isolated legacy screen modules. */
function getViewContext() {
  return {
    recent,
    rosters,
    settings,
    geminiConfigured: GEMINI_CONFIGURED,
    activeGroup,
    previousUnrolls,
    assignmentDietFilter,
    assignmentSearchQuery,
    get decodedClaimPayload() {
      return decodedClaimPayload;
    },
    set decodedClaimPayload(value) {
      decodedClaimPayload = value;
    },
    templates,
    esc,
    formatCurrency,
    toPaise,
    renderHeader,
    currentBill,
    initOuting,
    members,
    go,
    computeBillShares,
    netBalances,
    minimumCashFlow,
    isValidUpiId,
    paymentUri,
    decodeShare,
  };
}

function renderAssign() {
  const markup = buildAssignmentMarkup(getViewContext());
  if (typeof markup === 'string') {
    mountLegacyView(AssignmentView, markup);
    attachDragAndDrop();
  }
}





/* ==========================================================================
   VIEW 5: INDIVIDUAL BREAKDOWN & PAYER RECORDING
   ========================================================================== */


function renderBreakdown() {
  const markup = buildBreakdownMarkup(getViewContext());
  if (typeof markup === 'string') mountLegacyView(BreakdownView, markup);
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
    case 'dashboard':
      renderDashboard();
      break;
    case 'groups':
      renderGroups();
      break;
    case 'bill':
      renderBill();
      break;
    case 'assign':
      renderAssign();
      break;
    case 'breakdown':
      renderBreakdown();
      break;
    case 'settlements':
      renderSettlements();
      break;
    case 'settings':
      renderSettings();
      break;
    default:
      renderDashboard();
  }
}



function showAmbiguityDialog(prompt, choices, onSelect) {
  $('#ambiguity-prompt').textContent = prompt;
  const container = $('#ambiguity-choices');
  container.innerHTML = choices
    .map(
      (c) => `
    <button type="button" class="button button-secondary" data-choice-val="${esc(c.value)}" style="width:100%;justify-content:flex-start;margin-bottom:8px;">
      ${esc(c.label)}
    </button>
  `,
    )
    .join('');

  pendingAmbiguityAction = onSelect;
  $('#ambiguity-dialog').showModal();
}


/* --------------------------------------------------------------------------
   Feature controller composition
   -------------------------------------------------------------------------- */
const billingController = createBillingController({
  $, $$, currentBill, members, toPaise, uid, validateFields, toast, calculateShares,
  formatCurrency, renderBreakdown,
});
const {
  syncBillFromDom,
  validateBillEntry,
  computeBillShares,
  updateLivePayerSummary,
  applyPayerAmounts,
  updateBillTotalsLive,
} = billingController;

const assignmentController = createAssignmentController({
  $$, currentBill, members, renderAssign, toast, showAmbiguityDialog,
});
const { attachDragAndDrop, toggleItemAssignment, executeNaturalLanguageCommand } = assignmentController;

const receiptController = createReceiptController({
  $, toast, validateFileInput,
  geminiConfigured: GEMINI_CONFIGURED, go, settings, scanReceipt, currentBill, uid,
  toPaise, renderBill, esc,
});
const { handleReceiptScan } = receiptController;

function formatReceiptFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function updateReceiptSelection(input, { notify = true } = {}) {
  const fileStatus = $('#receipt-file-status');
  const dropZone = $('#receipt-drop-zone');
  const scanStatus = $('#scan-status');
  const file = input?.files?.[0];
  if (!file) {
    if (fileStatus) fileStatus.innerHTML = '';
    dropZone?.classList.remove('has-file', 'is-dragover');
    return false;
  }

  if (!validateFileInput(input, 'image')) {
    const message = input.parentElement?.querySelector('.field-validation-message')?.textContent
      || 'Choose a JPG, PNG, WEBP or HEIC image under 15 MB.';
    clearFieldValidation(input);
    input.value = '';
    dropZone?.classList.remove('has-file', 'is-dragover');
    if (fileStatus) {
      fileStatus.innerHTML = `<div class="receipt-upload-error" role="alert">${esc(message)}</div>`;
    }
    if (notify) toast(message, true);
    return false;
  }

  clearFieldValidation(input);
  dropZone?.classList.add('has-file');
  if (fileStatus) {
    fileStatus.innerHTML = `
      <div class="receipt-selected-file">
        <span class="receipt-selected-file__icon" aria-hidden="true">✓</span>
        <span class="receipt-selected-file__details">
          <strong>${esc(file.name)}</strong>
          <small>${formatReceiptFileSize(file.size)} · Ready to scan</small>
        </span>
        <button type="button" class="receipt-remove-file" data-action="clear-receipt" aria-label="Remove selected receipt">Remove</button>
      </div>`;
  }
  if (scanStatus) scanStatus.textContent = '';
  return true;
}

installReceiptDropListeners((input, error) => {
  if (error) {
    const fileStatus = $('#receipt-file-status');
    if (fileStatus) fileStatus.innerHTML = `<div class="receipt-upload-error" role="alert">${esc(error.message)}</div>`;
    toast(error.message, true);
    return;
  }
  if (input) updateReceiptSelection(input);
});

const settlementController = createSettlementController({
  $, computeBillShares, netBalances, minimumCashFlow, members, isValidUpiId,
  paymentUri, renderQR, formatCurrency, toast, esc, splitPayment,
});
const { openQRModal, copyPaymentDetails, openSplitThresholdModal } = settlementController;

const claimsController = createClaimsController({
  $, $$, currentBill, members, toast, esc, validateFields, setFieldValidationError,
  clearFieldValidation, getDecodedClaimPayload: () => decodedClaimPayload,
  importedClaims, go,
});
const { shareClaimUrl, generateWhatsAppClaim, promptImportClaim } = claimsController;

/* ==========================================================================
   EVENT DELEGATION AND ACTION DISPATCH
   ========================================================================== */
document.addEventListener('click', async (e) => {
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
      const g = rosters.find((x) => x.id === actionBtn.dataset.id);
      if (g) initOuting(g);
      break;
    }

    case 'create-group': {
      const name = prompt('Enter group name (e.g. Goa Trip, Flat 402):');
      if (name && name.trim()) {
        const cleanName = name.trim();
        if (cleanName.length < 2 || cleanName.length > 80) {
          toast('Group name must be between 2 and 80 characters.', true);
          return;
        }
        const g = freshRoster(cleanName, 4);
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
      const g = rosters.find((x) => x.id === actionBtn.dataset.id);
      if (g) {
        const newName = prompt('Rename group:', g.name);
        if (newName && newName.trim()) {
          const cleanName = newName.trim();
          if (cleanName.length < 2 || cleanName.length > 80) {
            toast('Group name must be between 2 and 80 characters.', true);
            return;
          }
          g.name = cleanName;
          saveRosters(rosters);
          renderGroups();
        }
      }
      break;
    }

    case 'delete-group': {
      const id = actionBtn.dataset.id;
      if (confirm('Delete this group and its member profiles?')) {
        rosters = rosters.filter((x) => x.id !== id);
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
      const g = rosters.find((x) => x.id === gid);
      if (g && confirm('Remove this member profile?')) {
        g.members = g.members.filter((m) => m.id !== mid);
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
        b.items.push({
          id: uid('item'),
          name: '',
          quantity: 1,
          unitPaise: 0,
          totalPaise: 0,
          category: 'ANY',
          assignments: [],
        });
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
      if (!validateBillEntry()) return;
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
      b.items.forEach((item) => {
        if (item.category === 'VEG') {
          const eligible = gMembers.filter((m) => m.dietaryTag === 'VEG').map((m) => m.id);
          if (eligible.length) {
            item.assignments = eligible;
            changed++;
          }
        } else if (item.category === 'NON-VEG') {
          const eligible = gMembers.filter((m) => m.dietaryTag === 'NON-VEG').map((m) => m.id);
          if (eligible.length) {
            item.assignments = eligible;
            changed++;
          }
        }
      });

      toast(`Dietary preferences applied to ${changed} item(s).`);
      renderAssign();
      break;
    }

    case 'split-remaining-equally': {
      const b = currentBill();
      if (!b) return;
      const allIds = members().map((m) => m.id);
      let count = 0;
      b.items.forEach((item) => {
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

      b.items.forEach((item) => {
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
        last.records.forEach((rec) => {
          b.items = undoUnrollItem(b.items, rec.original);
        });
      }
      toast('Undo unroll completed.');
      renderAssign();
      break;
    }

    case 'run-command': {
      const input = $('#command-input');
      if (input && validateField(input)) {
        executeNaturalLanguageCommand(input.value);
        input.value = '';
        clearFieldValidation(input);
        delete input.dataset.validationTouched;
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
          amountPaise: base + (i < rem ? 1 : 0),
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
      inputs.forEach((inp) => {
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
      const allIds = members().map((m) => m.id);
      let count = 0;
      b.items.forEach((item) => {
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

      // Validate and commit current payer inputs before computing settlements.
      if (!applyPayerAmounts(false)) {
        toast('Payment amounts must be valid and add up exactly to the bill total.', true);
        $('#payers-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      // Re-compute after committing inputs.
      const updatedCalc = computeBillShares();
      const updatedBill = updatedCalc.bill;
      const unassigned = updatedCalc.items.filter(
        (i) => !i.assignments || i.assignments.length === 0,
      );

      if (unassigned.length > 0) {
        toast(
          `⚠️ Cannot generate settlement plan: ${unassigned.length} item(s) are unassigned! Please assign or split them first.`,
          true,
        );
        const banner = $('#unassigned-banner');
        if (banner) {
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          banner.style.boxShadow = '0 0 0 3px var(--warning)';
          setTimeout(() => {
            if (banner) banner.style.boxShadow = '';
          }, 2500);
        }
        return;
      }

      const totalPaidPaise = (updatedBill.payers || []).reduce(
        (acc, p) => acc + (p.amountPaise || 0),
        0,
      );
      const diff = updatedCalc.grandTotal - totalPaidPaise;
      if (diff !== 0) {
        toast(
          `⚠️ Recorded payments (${formatCurrency(totalPaidPaise)}) must equal the bill grand total (${formatCurrency(updatedCalc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diff))}.`,
          true,
        );
        const aside = $('#payers-panel');
        if (aside) {
          aside.scrollIntoView({ behavior: 'smooth', block: 'center' });
          aside.style.boxShadow = '0 0 0 3px var(--danger)';
          setTimeout(() => {
            if (aside) aside.style.boxShadow = '';
          }, 2500);
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

    case 'test-gemini-connection': {
      const resultBox = $('#test-key-result');
      if (!GEMINI_API_KEY) {
        toast('Gemini is not configured. Add VITE_GEMINI_API_KEY to your .env file and restart Vite.', true);
        if (resultBox) resultBox.innerHTML = '<div class="warning" role="alert">Gemini is not configured. Add <code>VITE_GEMINI_API_KEY</code> to your local .env file and restart the development server.</div>';
        return;
      }
      if (resultBox) resultBox.innerHTML = '<span class="quiet">Testing connection to Google Gemini API…</span>';
      try {
        const available = await listAvailableModels();
        if (resultBox) {
          resultBox.innerHTML = 
            '<div class="success">✓ <strong>Gemini connection succeeded.</strong><br>' +
            '<span class="quiet" style="font-size:12px;">Available models: ' +
            available.slice(0, 6).map((model) => '<code>' + esc(model) + '</code>').join(', ') +
            (available.length > 6 ? ' (+' + (available.length - 6) + ' more)' : '') +
            '</span></div>';
        }
      } catch (err) {
        if (resultBox) resultBox.innerHTML = '<div class="warning" role="alert">Connection failed: ' + esc(err.message) + '</div>';
        toast(err.message || 'Gemini connection failed.', true);
      }
      break;
    }

    case 'save-model-preference': {
      const modelSelect = $('#gemini-model-select');
      if (modelSelect && validateField(modelSelect)) {
        settings.selectedModel = modelSelect.value || 'auto';
        saveSettings(settings);
        toast('Receipt scanner model preference saved.');
      }
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
      if (
        confirm('Permanently wipe all SplitSmart groups, history, and settings from this device?')
      ) {
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
        $('#test-results-output').innerHTML =
          `<span style="color:var(--success);">✓ ${esc(res)}</span>`;
      } catch (err) {
        $('#test-results-output').innerHTML =
          `<span style="color:var(--danger);">✗ Test failure: ${esc(err.message)}</span>`;
      }
      break;
    }

    case 'clear-receipt': {
      const input = $('#receipt-upload');
      if (input) {
        input.value = '';
        clearFieldValidation(input);
        updateReceiptSelection(input, { notify: false });
      }
      const status = $('#scan-status');
      if (status) status.textContent = '';
      break;
    }

    case 'scan-receipt': {
      handleReceiptScan();
      break;
    }

    case 'reopen-bill': {
      const id = actionBtn.dataset.id;
      const rec = recent.find((r) => r.id === id);
      if (rec && rec.session) {
        outingSession = rec.session;
        activeGroup = rec.group || rosters.find((g) => g.id === rec.session.groupId) || rosters[0];
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
  const g = rosters.find((x) => x.id === groupId);
  if (!g) return;
  const m = memberId ? g.members.find((x) => x.id === memberId) : null;
  const form = $('#member-form');

  form.elements.id.value = m?.id || '';
  form.elements.name.value = m?.name || '';
  form.elements.upiId.value = m?.upiId || '';
  form.elements.dietaryTag.value = m?.dietaryTag || 'ANY';
  form.dataset.groupId = groupId;
  form.querySelectorAll('[data-validate]').forEach((field) => {
    clearFieldValidation(field);
    delete field.dataset.validationTouched;
  });

  $('#member-dialog-title').textContent = m ? 'Edit Member' : 'Add Member';
  $('#member-dialog').showModal();
}

$('#member-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  if (!validateFields(form)) {
    toast('Please correct the highlighted member fields.', true);
    return;
  }
  const gid = form.dataset.groupId;
  const g = rosters.find((x) => x.id === gid);
  if (!g) return;

  const id = form.elements.id.value;
  const name = form.elements.name.value.trim();
  const upiId = form.elements.upiId.value.trim();
  const dietaryTag = form.elements.dietaryTag.value;

  // Duplicate name check
  if (g.members.some((m) => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
    setFieldValidationError(
      form.elements.name,
      `A member named "${name}" already exists in this group.`,
    );
    form.elements.name.focus();
    toast(`A member named "${name}" already exists in this group.`, true);
    return;
  }

  if (id) {
    g.members = g.members.map((m) =>
      m.id === id ? { ...m, name, upiId, dietaryTag, example: false } : m,
    );
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
document.addEventListener('change', (e) => {
  if (e.target.id === 'gemini-model-select' && validateField(e.target)) {
    settings.selectedModel = e.target.value || 'auto';
    saveSettings(settings);
    toast('Receipt scanner model preference saved.');
  }

  if (e.target.dataset.action === 'set-primary-payer') {
    const gid = e.target.dataset.group;
    const g = rosters.find((x) => x.id === gid);
    if (g) {
      g.primaryPayerId = e.target.value || null;
      saveRosters(rosters);
      toast('Default payer updated for this group.');
    }
  }

  if (e.target.id === 'backup-file-input') {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!validateFileInput(e.target, 'json')) {
      toast('Please choose a valid JSON backup file under 10 MB.', true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        importBackup(parsed);
        rosters = getRosters();
        toast('Backup successfully restored!');
        clearFieldValidation(e.target);
        e.target.value = '';
        renderGroups();
      } catch (err) {
        setFieldValidationError(e.target, 'This file is not a valid SplitSmart JSON backup.');
        toast(err.message, true);
      }
    };
    reader.onerror = () => {
      setFieldValidationError(e.target, 'The selected backup file could not be read.');
      toast('The selected backup file could not be read.', true);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (e.target.id === 'receipt-upload') {
    updateReceiptSelection(e.target);
  }

  if (e.target.matches('[data-claim-item]')) {
    const selected = $$('[data-claim-item]:checked').length > 0;
    if (selected) clearFieldValidation($('#claim-items-list'));
  }

  if (e.target.matches('[data-search-group]')) {
    const gid = e.target.dataset.searchGroup;
    const q = e.target.value.toLowerCase();
    const list = $(`[data-member-list="${CSS.escape(gid)}"]`);
    if (list) {
      list.querySelectorAll('.list-row').forEach((row) => {
        const name = row.querySelector('.list-row-main div')?.textContent.toLowerCase() || '';
        row.style.display = name.includes(q) ? '' : 'none';
      });
    }
  }
});

// Dynamic Item Line Total Calculations on Bill Input
document.addEventListener('input', (e) => {
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.payer-amount-input')) {
    e.preventDefault();
    applyPayerAmounts(true);
  }
});



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

  recognitionInstance.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = $('#command-input');
    if (input) input.value = transcript;
    toast(`Heard: "${transcript}"`);
    executeNaturalLanguageCommand(transcript);
  };

  recognitionInstance.onerror = (e) => {
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
  if (view === 'bill' && !validateBillEntry()) return false;
  if (view === 'bill') syncBillFromDom();
  const calc = computeBillShares();
  if (!calc) return false;

  const record = {
    id: outingSession.id,
    restaurantName: calc.bill.restaurantName || 'Shared Outing',
    date: calc.bill.date || new Date().toISOString().slice(0, 10),
    groupName: activeGroup?.name || 'Group',
    peopleCount: members().length,
    totalPaise: calc.grandTotal,
    group: activeGroup,
    session: outingSession,
  };

  recent = [record, ...recent.filter((r) => r.id !== record.id)].slice(0, 5);
  saveRecent(recent);
  toast('Bill saved to recent history.');
  return true;
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
