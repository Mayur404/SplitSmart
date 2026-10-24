/**
 * SplitSmart legacy feature controller.
 * DOM-driven bill workflows retained behind the React shell during migration.
 */

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
  listAvailableModels
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
  const recentBills = recent.slice(0, 5);
  const rowsHtml = recentBills.map(r => `
    <div class="list-row">
      <div class="member-initial">${esc((r.restaurantName || 'B').slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(r.restaurantName || 'Shared Outing')}</div>
        <div class="list-row-sub">${esc(r.date || '')} · ${esc(r.groupName || 'Group')} · ${r.peopleCount || 0} participants</div>
      </div>
      <div class="row-tail">
        <span class="amount">${formatCurrency(r.totalPaise || 0)}</span>
        <button class="button button-small button-secondary" data-action="reopen-bill" data-id="${esc(r.id)}">Open</button>
      </div>
    </div>
  `).join('');

  const groupsHtml = rosters.slice(0, 4).map(g => `
    <div class="list-row">
      <div class="member-initial">${esc(g.name.slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(g.name)}</div>
        <div class="list-row-sub">${g.members.length} members ${g.primaryPayerId ? '· Primary payer set' : ''}</div>
      </div>
      <button class="button button-small button-secondary" data-action="use-group-bill" data-id="${esc(g.id)}">Start Bill</button>
    </div>
  `).join('');

  $('#app').innerHTML = `
    ${renderHeader('Overview', 'Create a bill, assign what people consumed, and settle up cleanly via UPI.')}

    <section class="hero">
      <h2>One bill. Everyone’s share, figured out.</h2>
      <p>Proportional tax allocation, minimum cash flow debt settlement, and offline-first privacy. No server, no accounts.</p>
      <div class="hero-actions">
        <button class="button button-primary" data-action="new-bill">＋ Create a Bill</button>
        <button class="button button-secondary" data-view="groups">Choose a Group</button>
      </div>
    </section>

    <div class="columns">
      <section>
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Recent Outings</h2>
              <p>Stored locally on this device.</p>
            </div>
            ${recentBills.length ? '<button class="button button-quiet button-small" data-action="clear-history">Clear History</button>' : ''}
          </div>
          ${recentBills.length ? `<div class="list">${rowsHtml}</div>` : `
            <div class="empty">
              <h3>No bills recorded yet</h3>
              <p>Your recent outing summaries will appear here once saved.</p>
              <button class="button button-primary button-small" data-action="new-bill">Create Your First Bill</button>
            </div>
          `}
        </div>
      </section>

      <aside>
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Saved Groups</h2>
              <p>${rosters.length} group${rosters.length === 1 ? '' : 's'} configured</p>
            </div>
            <button class="button button-quiet button-small" data-view="groups">Manage →</button>
          </div>
          ${rosters.length ? `<div class="list">${groupsHtml}</div>` : `
            <div class="empty">
              <h3>No groups yet</h3>
              <p>Pick a template or add a custom group of friends or roommates.</p>
              <button class="button button-secondary button-small" data-view="groups">Create a Group</button>
            </div>
          `}
        </div>

        <div class="panel">
          <h2>Optional Gemini Scanning</h2>
          <p class="panel-intro">Scan physical receipts into item lists with Google Gemini 2.5 Flash.</p>
          <p class="quiet" style="font-size:13px;margin-bottom:12px;">
            ${settings.apiKey ? '✓ AI scanner is configured with your API key.' : 'AI scanner is unconfigured. Manual bill entry is fully functional.'}
          </p>
          <button class="button button-secondary button-small" data-view="settings">${settings.apiKey ? 'Manage AI Key' : 'Configure Gemini Key'}</button>
        </div>
      </aside>
    </div>
  `;
}

/* ==========================================================================
   VIEW 2: GROUPS MANAGER
   ========================================================================== */
function renderGroups() {
  const tpls = templates();
  const groupCards = rosters.map(g => {
    const isCurrent = activeGroup?.id === g.id;
    const membersHtml = g.members.map(m => `
      <div class="list-row" style="padding:10px 4px;">
        <div class="member-initial" style="width:30px;height:30px;font-size:12px;">${esc(m.name.slice(0, 1).toUpperCase())}</div>
        <div class="list-row-main">
          <div style="font-weight:600;font-size:14px;">
            ${esc(m.name)}
            ${g.primaryPayerId === m.id ? '<span class="pill" style="margin-left:6px;background:var(--accent-soft);color:var(--accent);">Primary Payer</span>' : ''}
          </div>
          <div class="quiet" style="font-size:12px;">
            <span class="pill ${m.dietaryTag === 'VEG' ? 'pill-veg' : m.dietaryTag === 'NON-VEG' ? 'pill-non-veg' : ''}">${esc(m.dietaryTag)}</span>
            ${m.upiId ? ` · ${esc(m.upiId)}` : ' · No UPI'}
            ${m.example ? ' · <span style="color:var(--warning)">Example (Editable)</span>' : ''}
          </div>
        </div>
        <div class="row-tail">
          <button class="button button-quiet button-small" data-action="edit-member" data-group="${esc(g.id)}" data-id="${esc(m.id)}">Edit</button>
          <button class="button button-quiet button-small danger-text" data-action="delete-member" data-group="${esc(g.id)}" data-id="${esc(m.id)}">Remove</button>
        </div>
      </div>
    `).join('');

    return `
      <section class="panel" data-group-card="${esc(g.id)}">
        <div class="section-head">
          <div>
            <h2>${esc(g.name)} ${isCurrent ? '<span class="pill">Active</span>' : ''}</h2>
            <p>${g.members.length} member${g.members.length === 1 ? '' : 's'} (max 30)</p>
          </div>
          <div class="button-row" style="margin:0;">
            <button class="button button-primary button-small" data-action="use-group-bill" data-id="${esc(g.id)}">Start Bill</button>
            <button class="button button-secondary button-small" data-action="rename-group" data-id="${esc(g.id)}">Rename</button>
            <button class="button button-danger button-small" data-action="delete-group" data-id="${esc(g.id)}">Delete</button>
          </div>
        </div>

        <div style="margin:12px 0;">
          <input type="search" placeholder="Search members in ${esc(g.name)}…" data-search-group="${esc(g.id)}" style="max-width:320px;">
        </div>

        <div class="list" data-member-list="${esc(g.id)}">
          ${membersHtml || '<p class="quiet" style="padding:14px 0;">No members in this group yet.</p>'}
        </div>

        <div class="button-row">
          <button class="button button-secondary button-small" data-action="add-member" data-group="${esc(g.id)}">＋ Add Member</button>
          ${g.members.length > 0 ? `
            <select data-action="set-primary-payer" data-group="${esc(g.id)}" style="max-width:240px;height:34px;padding:4px 8px;font-size:13px;">
              <option value="">-- Set Default Payer --</option>
              ${g.members.map(m => `<option value="${esc(m.id)}" ${g.primaryPayerId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </section>
    `;
  }).join('');

  $('#app').innerHTML = `
    ${renderHeader('Group Roster', 'Configure groups, individual UPI IDs, and dietary preferences. Everything stays on this device.', `
      <button class="button button-primary" data-action="create-group">＋ New Group</button>
    `)}

    <div class="panel" style="background:var(--surface-alt);border-style:dashed;">
      <h3 style="font-size:15px;margin-bottom:8px;">Quick-Start Preset Templates</h3>
      <p class="quiet" style="font-size:13px;margin-bottom:14px;">Add a preset group. Template profiles are marked as examples and can be edited or renamed freely.</p>
      <div class="button-row" style="margin:0;">
        ${tpls.map(t => `
          <button class="button button-secondary button-small" data-action="add-template" data-name="${esc(t.name)}" data-count="${t.members.length}">
            ＋ ${esc(t.name)} (${t.members.length})
          </button>
        `).join('')}
      </div>
    </div>

    ${groupCards || `
      <div class="empty">
        <h3>No groups yet</h3>
        <p>Create a group from scratch or choose a preset template above.</p>
      </div>
    `}

    <section class="panel">
      <h2>Backup &amp; Restore</h2>
      <p class="panel-intro">Export your group rosters and member UPI IDs as a JSON file, or restore a previous backup.</p>
      <div class="button-row">
        <button class="button button-secondary" data-action="export-backup">Export JSON Backup</button>
        <label class="button button-secondary" style="margin:0;cursor:pointer;">
          Import JSON Backup
          <input type="file" id="backup-file-input" accept="application/json,.json" style="display:none;">
        </label>
      </div>
    </section>
  `;
}

/* ==========================================================================
   VIEW 3: BILL CREATION
   ========================================================================== */
function currentBill() {
  if (!outingSession || !outingSession.bills.length) return null;
  return outingSession.bills[0];
}

function renderBill() {
  const bill = currentBill();
  if (!bill) {
    initOuting(activeGroup);
    return;
  }

  const items = bill.items || [];
  const foodSubtotalPaise = items.reduce((acc, it) => acc + (toPaise(it.unitPaise / 100) * (Number(it.quantity) || 1)), 0);

  const cgstPaise = toPaise(bill.tax.cgst);
  const sgstPaise = toPaise(bill.tax.sgst);
  const scPaise = toPaise(bill.tax.serviceCharge);
  const discountPaise = toPaise(bill.discount);

  const calculatedGrandTotalPaise = Math.max(0, foodSubtotalPaise + cgstPaise + sgstPaise + scPaise - discountPaise);
  const statedPaise = bill.statedTotal != null && bill.statedTotal !== '' ? toPaise(bill.statedTotal) : null;
  const hasDiscrepancy = statedPaise != null && statedPaise !== calculatedGrandTotalPaise;

  const itemRowsHtml = items.map((it, idx) => {
    const qty = Number(it.quantity) || 1;
    const unitRupees = (Number(it.unitPaise) / 100).toFixed(2);
    const lineTotalPaise = Math.round(it.unitPaise * qty);

    return `
      <div class="item-entry" data-item-idx="${idx}">
        <label>
          Item Name
          <input type="text" data-field="name" value="${esc(it.name)}" placeholder="e.g. Paneer Butter Masala" required autocomplete="off">
        </label>
        <label>
          Qty
          <input type="number" data-field="quantity" value="${qty}" min="0.01" step="any" required>
        </label>
        <label>
          Unit Price (₹)
          <input type="number" data-field="unitPrice" value="${unitRupees}" min="0" step="0.01" required>
        </label>
        <div class="item-entry-total">
          Line Total
          <div class="item-total-display">${formatCurrency(lineTotalPaise)}</div>
        </div>
        <label>
          Diet Tag
          <select data-field="category">
            <option value="ANY" ${it.category === 'ANY' ? 'selected' : ''}>ANY</option>
            <option value="VEG" ${it.category === 'VEG' ? 'selected' : ''}>VEG</option>
            <option value="NON-VEG" ${it.category === 'NON-VEG' ? 'selected' : ''}>NON-VEG</option>
          </select>
        </label>
        <button type="button" class="icon-button item-remove" data-action="remove-item" data-idx="${idx}" title="Remove item" aria-label="Remove item">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
    `;
  }).join('');

  $('#app').innerHTML = `
    ${renderHeader('Enter Bill Details', 'Add items manually or scan a paper receipt. You can finish without AI.', `
      <button class="button button-secondary" data-view="groups">Change Group (${esc(activeGroup?.name || 'Group')})</button>
    `)}

    <div class="columns">
      <section>
        <div class="panel">
          <h2>Bill Information</h2>
          <div class="field-grid">
            <label>
              Restaurant / Outing Name
              <input id="bill-restaurant" value="${esc(bill.restaurantName)}" placeholder="e.g. Social, Koramangala">
            </label>
            <label>
              Date
              <input id="bill-date" type="date" value="${esc(bill.date)}">
            </label>
            <label class="full">
              Notes <span class="quiet">(Optional)</span>
              <input id="bill-notes" value="${esc(bill.notes)}" placeholder="e.g. Friday team dinner">
            </label>
          </div>
        </div>

        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Items</h2>
              <p>Add all food and drink items from the receipt.</p>
            </div>
            <span class="pill">${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>

          <div id="items-container">
            ${itemRowsHtml}
          </div>

          <div class="button-row" style="margin-top:14px;">
            <button class="button button-secondary button-small" data-action="add-item-row">＋ Add Item</button>
          </div>

          <hr class="divider">

          <div class="total-line">
            <span>Food Subtotal</span>
            <strong class="amount" id="food-subtotal-display">${formatCurrency(foodSubtotalPaise)}</strong>
          </div>
        </div>

        <div class="panel">
          <h2>Tax, Service Charge &amp; Discount</h2>
          <p class="panel-intro">Enter amounts in rupees. Taxes and discounts are proportionally allocated to each person based on their food subtotal.</p>
          <div class="field-grid three">
            <label>
              CGST (₹)
              <input id="tax-cgst" type="number" min="0" step="0.01" value="${bill.tax.cgst || ''}" placeholder="0.00">
            </label>
            <label>
              SGST (₹)
              <input id="tax-sgst" type="number" min="0" step="0.01" value="${bill.tax.sgst || ''}" placeholder="0.00">
            </label>
            <label>
              Service Charge (₹)
              <input id="tax-sc" type="number" min="0" step="0.01" value="${bill.tax.serviceCharge || ''}" placeholder="0.00">
            </label>
            <label>
              Discount (₹)
              <input id="bill-discount" type="number" min="0" step="0.01" value="${bill.discount || ''}" placeholder="0.00">
            </label>
            <label class="full">
              Receipt Stated Grand Total (₹) <span class="quiet">(Optional verification)</span>
              <input id="stated-total" type="number" min="0" step="0.01" value="${bill.statedTotal ?? ''}" placeholder="${(calculatedGrandTotalPaise / 100).toFixed(2)}">
            </label>
          </div>

          ${hasDiscrepancy ? `
            <div class="warning">
              ⚠️ <strong>Receipt Discrepancy:</strong> Stated total is <strong>${formatCurrency(statedPaise)}</strong>, but calculated total is <strong>${formatCurrency(calculatedGrandTotalPaise)}</strong> (Difference: ${formatCurrency(statedPaise - calculatedGrandTotalPaise)}).
              <div style="margin-top:8px;">
                <button class="button button-small button-secondary" data-action="sync-calculated-total">Use Calculated Total (${formatCurrency(calculatedGrandTotalPaise)})</button>
              </div>
            </div>
          ` : ''}

          <div class="total-line grand">
            <span>Grand Total</span>
            <strong class="amount" id="grand-total-display">${formatCurrency(calculatedGrandTotalPaise)}</strong>
          </div>
        </div>

        <div class="button-row">
          <button class="button button-primary" data-action="go-to-assign">Assign Items →</button>
          <button class="button button-secondary" data-action="save-draft">Save Draft</button>
        </div>
      </section>

      <aside>
        <div class="panel">
          <h2>Scan Receipt with AI</h2>
          <p class="panel-intro">Take a picture or select an image. Automatically compressed client-side to max 1024px before scanning with Gemini.</p>
          <div class="receipt-picker" style="margin-bottom:14px;">
            <input type="file" id="receipt-upload" accept="image/*" capture="environment" style="font-size:12px;">
          </div>
          <div class="button-row">
            <button class="button button-secondary button-small" id="scan-btn" data-action="scan-receipt">
              <span id="scan-spinner" style="display:none;">⏳ </span>Scan Receipt
            </button>
            <button class="button button-quiet button-small" data-view="settings">AI Settings</button>
          </div>
          <div id="scan-status" style="margin-top:12px;"></div>
        </div>

        <div class="panel">
          <h2>Active Group</h2>
          <p class="panel-intro">${esc(activeGroup?.name || 'Group')}</p>
          ${members().length > 0 ? `
            <div class="member-chips">
              ${members().map(m => `
                <span class="chip" style="cursor:default;">
                  ${esc(m.name)}
                  <small class="quiet">${esc(m.dietaryTag)}</small>
                </span>
              `).join('')}
            </div>
          ` : `
            <div class="warning">This group has no members! Add members in the Groups tab to proceed.</div>
          `}
          <div style="margin-top:14px;">
            <button class="button button-secondary button-small" data-view="groups">Manage Group Members</button>
          </div>
        </div>
      </aside>
    </div>
  `;
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

function renderAssign() {
  const bill = currentBill();
  if (!bill) {
    go('bill');
    return;
  }

  const items = bill.items || [];
  const groupMembers = members();
  const unassignedCount = items.filter(i => !i.assignments || i.assignments.length === 0).length;

  // Filter members based on tab and search
  const filteredMembers = groupMembers.filter(m => {
    if (assignmentDietFilter !== 'ALL' && m.dietaryTag !== assignmentDietFilter) return false;
    if (assignmentSearchQuery && !m.name.toLowerCase().includes(assignmentSearchQuery.toLowerCase())) return false;
    return true;
  });

  const itemsHtml = items.map((it, idx) => {
    const assignedIds = new Set(it.assignments || []);
    const isUnassigned = assignedIds.size === 0;
    const lineTotal = formatCurrency(it.totalPaise);

    // Can unroll if quantity > 1 and not yet unrolled
    const canUnroll = Math.trunc(Number(it.quantity)) > 1 && !it.unrolledFrom;

    return `
      <div class="assignment-item" data-item-id="${esc(it.id)}" data-item-idx="${idx}">
        <div class="assignment-title">
          <div>
            <strong>${esc(it.name || 'Unnamed Item')}</strong>
            <span class="quiet" style="font-size:13px;margin-left:6px;">× ${it.quantity}</span>
            <span class="pill ${it.category === 'VEG' ? 'pill-veg' : it.category === 'NON-VEG' ? 'pill-non-veg' : ''}" style="margin-left:6px;">${esc(it.category)}</span>
            ${canUnroll ? `<button class="button button-quiet button-small" data-action="unroll-single" data-idx="${idx}" style="font-size:11.5px;padding:2px 8px;">Unroll Qty</button>` : ''}
          </div>
          <div class="assignment-meta">
            <span class="amount">${lineTotal}</span>
          </div>
        </div>

        <div class="member-chips" data-drop-zone="${esc(it.id)}">
          ${groupMembers.map(m => {
            const isSelected = assignedIds.has(m.id);
            return `
              <button
                type="button"
                class="chip ${isSelected ? 'selected' : ''}"
                data-action="toggle-assignment"
                data-item-id="${esc(it.id)}"
                data-member-id="${esc(m.id)}"
                draggable="true"
                aria-pressed="${isSelected}">
                ${esc(m.name)}
              </button>
            `;
          }).join('')}
        </div>

        <div class="quiet" style="font-size:12px;margin-top:8px;">
          ${isUnassigned ? '<span style="color:var(--warning)">⚠️ Unassigned</span>' : `Shared by ${assignedIds.size} (${[...assignedIds].map(id => esc(groupMembers.find(m => m.id === id)?.name || 'Unknown')).join(', ')})`}
        </div>
      </div>
    `;
  }).join('');

  $('#app').innerHTML = `
    ${renderHeader('Assign Items', 'Tap or drag people onto items to assign who shared them. Divisible costs split equally.', `
      <button class="button button-secondary" data-action="back-to-bill">← Edit Bill</button>
    `)}

    <div class="panel" style="background:var(--surface-alt);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <div class="button-row" style="margin:0;">
          <button class="button button-secondary button-small" data-action="auto-split-diet">⚡ Auto-Split by Diet</button>
          <button class="button button-secondary button-small" data-action="split-remaining-equally">Split Remaining Equally</button>
          <button class="button button-secondary button-small" data-action="unroll-all">Unroll All Quantities</button>
          ${previousUnrolls.length ? '<button class="button button-quiet button-small" data-action="undo-unroll">Undo Unroll</button>' : ''}
        </div>
        <span class="pill" style="font-size:13px;">${unassignedCount} unassigned</span>
      </div>

      <!-- Natural Language Command Bar -->
      <div class="command-bar">
        <input type="text" id="command-input" placeholder="e.g. 'Assign naan to everyone', 'Put coffee on Sneha', 'Clear item 1'" autocomplete="off">
        <button class="button button-secondary button-small" id="mic-btn" data-action="voice-command" title="Voice command (Speech Recognition)">🎤</button>
        <button class="button button-primary button-small" data-action="run-command">Apply</button>
      </div>
      <p class="quiet" style="font-size:12px;margin-top:6px;">Deterministic in-browser matching. No cloud AI or speech audio transmission.</p>
    </div>

    <!-- Group Filter Bar (Useful for up to 30 people) -->
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0;">
      <div class="tabs" style="margin:0;">
        <button class="tab ${assignmentDietFilter === 'ALL' ? 'active' : ''}" data-action="filter-diet" data-filter="ALL">All (${groupMembers.length})</button>
        <button class="tab ${assignmentDietFilter === 'VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="VEG">VEG (${groupMembers.filter(m => m.dietaryTag === 'VEG').length})</button>
        <button class="tab ${assignmentDietFilter === 'NON-VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="NON-VEG">NON-VEG (${groupMembers.filter(m => m.dietaryTag === 'NON-VEG').length})</button>
      </div>
      <input type="search" id="assign-member-search" placeholder="Filter member chips by name…" value="${esc(assignmentSearchQuery)}" style="max-width:260px;height:34px;padding:4px 10px;font-size:13px;">
    </div>

    <section class="panel">
      <div id="assignment-list">
        ${itemsHtml || '<p class="quiet">No items to assign.</p>'}
      </div>
    </section>

    <div class="button-row">
      <button class="button button-primary" data-action="go-to-breakdown">Review Shares →</button>
      <button class="button button-secondary" data-action="share-claim-link">Share Bill for Claims</button>
    </div>
  `;

  // Attach Drag-and-Drop Event Listeners
  attachDragAndDrop();
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
  const calc = computeBillShares();
  if (!calc) {
    go('bill');
    return;
  }

  const bill = calc.bill;
  const unassigned = calc.items.filter(i => !i.assignments || i.assignments.length === 0);
  const hasUnassigned = unassigned.length > 0;

  // Initialize payers if empty: default to primary payer or first member
  if (!bill.payers || bill.payers.length === 0) {
    const defaultPayerId = activeGroup?.primaryPayerId || members()[0]?.id;
    if (defaultPayerId) {
      bill.payers = [{ memberId: defaultPayerId, amountPaise: calc.grandTotal }];
    }
  }

  const totalPaidPaise = (bill.payers || []).reduce((acc, p) => acc + (p.amountPaise || 0), 0);
  const payerDifference = calc.grandTotal - totalPaidPaise;
  const payersBalanced = Math.abs(payerDifference) === 0;

  const participantRows = calc.shares.map(s => {
    const m = calc.members.find(x => x.id === s.memberId);
    const paid = (bill.payers || []).filter(p => p.memberId === s.memberId).reduce((a, b) => a + b.amountPaise, 0);
    const net = paid - s.sharePaise;

    return `
      <details class="breakdown-item">
        <summary class="breakdown-row">
          <div>
            <strong>${esc(s.name)}</strong>
            ${paid > 0 ? '<span class="pill" style="margin-left:6px;">Payer</span>' : ''}
          </div>
          <span class="amount">${formatCurrency(s.foodPaise)}</span>
          <span class="amount">${s.taxDiscountPaise >= 0 ? '+' : ''}${formatCurrency(s.taxDiscountPaise)}</span>
          <span class="amount" style="font-weight:700;">${formatCurrency(s.sharePaise)}</span>
          <span class="amount ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}">
            ${net > 0 ? `+${formatCurrency(net)}` : net < 0 ? `-${formatCurrency(Math.abs(net))}` : '₹0.00'}
          </span>
        </summary>
        <div class="breakdown-expanded-info">
          <div><strong>Food subtotal:</strong> ${formatCurrency(s.foodPaise)}</div>
          <div><strong>Proportional tax &amp; discount:</strong> ${formatCurrency(s.taxDiscountPaise)}</div>
          <div><strong>Final calculated share:</strong> ${formatCurrency(s.sharePaise)}</div>
          <div><strong>Amount paid towards bill:</strong> ${formatCurrency(paid)}</div>
          <div><strong>Net position:</strong> ${net > 0 ? `Gets back ${formatCurrency(net)} from the group` : net < 0 ? `Owes ${formatCurrency(Math.abs(net))} to the group` : 'Settled (balance is zero)'}</div>
        </div>
      </details>
    `;
  }).join('');

  $('#app').innerHTML = `
    ${renderHeader('Individual Shares &amp; Payments', 'Proportional distribution of food, taxes, and discounts based on consumption.', `
      <button class="button button-secondary" data-action="back-to-assign">← Edit Assignments</button>
    `)}

    ${hasUnassigned ? `
      <div class="warning" id="unassigned-banner" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding:12px 16px;">
        <div style="flex:1;min-width:260px;">
          <div style="font-weight:700;font-size:14px;">⚠️ ${unassigned.length} item${unassigned.length === 1 ? '' : 's are'} unassigned!</div>
          <div style="font-size:12.5px;margin-top:2px;color:var(--text);">
            Unassigned: ${unassigned.map(u => `<strong style="text-decoration:underline;">${esc(u.name)}</strong>`).join(', ')}.
          </div>
          <div class="quiet" style="font-size:12px;margin-top:2px;">
            Every item must be assigned to at least one person before generating the settlement plan.
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button type="button" class="button button-small button-secondary" data-action="quick-split-unassigned">Split Remaining Equally</button>
          <button type="button" class="button button-small button-primary" data-action="back-to-assign">Assign Items Manually →</button>
        </div>
      </div>
    ` : ''}

    <div class="columns">
      <section>
        <div class="panel">
          <div class="breakdown-row head">
            <span>Participant</span>
            <span>Food</span>
            <span>Tax/Disc</span>
            <span>Share</span>
            <span>Net Balance</span>
          </div>
          <div class="breakdown-list">
            ${participantRows}
          </div>

          <div class="total-line grand">
            <span>Bill Total</span>
            <strong class="amount">${formatCurrency(calc.grandTotal)}</strong>
          </div>
        </div>
      </section>

      <aside>
        <div class="panel" id="payers-panel">
          <h2>Who Paid the Bill?</h2>
          <p class="panel-intro">Record who paid at the venue. Edit amounts, then click <strong>Update Calculations</strong> below.</p>

          <div class="payer-list" style="display:flex;flex-direction:column;gap:10px;">
            ${calc.members.map(m => {
              const currentPaid = (bill.payers || []).find(p => p.memberId === m.id)?.amountPaise || 0;
              return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <span style="font-size:13.5px;font-weight:600;min-width:70px;">${esc(m.name)}</span>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <span style="font-size:13px;color:var(--muted);">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      class="payer-amount-input"
                      data-member-id="${esc(m.id)}"
                      value="${(currentPaid / 100).toFixed(2)}"
                      style="max-width:105px;text-align:right;">
                    <button type="button" class="button button-small button-secondary" data-action="fill-remaining-payer" data-member-id="${esc(m.id)}" title="Fill remaining unpaid balance to ${esc(m.name)}" style="padding:4px 8px;font-size:11px;white-space:nowrap;">+ Rest</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">
            <div class="total-line">
              <span>Total Recorded Paid</span>
              <strong class="amount" id="payer-total-display">${formatCurrency(totalPaidPaise)}</strong>
            </div>
            <div id="payer-status-msg">
              ${!payersBalanced ? `
                <div class="warning" style="font-size:12.5px;margin-top:8px;">
                  Recorded payments (${formatCurrency(totalPaidPaise)}) must equal the bill grand total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(payerDifference))}.
                </div>
              ` : `
                <div class="success" style="font-size:12.5px;padding:8px 12px;margin-top:8px;">
                  ✓ Total paid matches bill total (${formatCurrency(calc.grandTotal)}).
                </div>
              `}
            </div>
          </div>

          <div style="margin-top:12px;">
            <button type="button" class="button button-primary button-small" data-action="apply-payers" style="width:100%;">
              Update Calculations
            </button>
          </div>

          <div class="button-row" style="margin-top:8px;">
            <button class="button button-secondary button-small" data-action="set-first-payer">Set 1st Person as Full Payer</button>
            <button class="button button-secondary button-small" data-action="split-payers-equally">Split Payments Equally</button>
          </div>
        </div>
      </aside>
    </div>

    <div class="button-row">
      <button class="button button-primary" data-action="finalize-settlement">
        Generate Settlement Plan →
      </button>
      <button class="button button-secondary" data-action="save-current-bill">Save Session Locally</button>
    </div>
  `;
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
  const calc = computeBillShares();
  if (!calc) {
    go('dashboard');
    return;
  }

  const bill = calc.bill;
  let settlements = [];

  try {
    const balances = netBalances(calc.shares, bill.payers || []);
    settlements = minimumCashFlow(balances);
  } catch (err) {
    $('#app').innerHTML = `
      ${renderHeader('Settlement Plan Error', 'Unable to balance cash flow.')}
      <div class="panel">
        <div class="warning">${esc(err.message)}</div>
        <button class="button button-primary" data-view="breakdown">← Return to Shares &amp; Payments</button>
      </div>
    `;
    return;
  }

  const thresholdPaise = settings.upiThresholdPaise || 200000; // ₹2,000

  const settlementsHtml = settlements.map((st, idx) => {
    const creditorMember = calc.members.find(m => m.id === st.creditor);
    const upiId = creditorMember?.upiId || '';
    const hasUpi = isValidUpiId(upiId);
    const isAboveThreshold = st.amountPaise > thresholdPaise;

    let upiDeepLink = '#';
    if (hasUpi) {
      try {
        upiDeepLink = paymentUri({
          upiId,
          name: st.creditorName,
          amountPaise: st.amountPaise,
          note: `SplitSmart - ${bill.restaurantName || 'Bill'}`
        });
      } catch {}
    }

    return `
      <div class="settlement" data-settlement-idx="${idx}">
        <div class="settlement-payer">
          <strong style="font-size:15px;">${esc(st.debtorName)}</strong>
          <span class="quiet" style="font-size:12px;">owes</span>
        </div>

        <div class="settlement-arrow" aria-hidden="true">→</div>

        <div class="settlement-payee">
          <strong style="font-size:15px;">${esc(st.creditorName)}</strong>
          <span class="quiet" style="font-size:12px;">${hasUpi ? esc(upiId) : 'No UPI configured'}</span>
        </div>

        <div class="settlement-amount amount">
          ${formatCurrency(st.amountPaise)}
        </div>

        <div class="pay-actions">
          ${hasUpi ? `
            <a class="button button-primary button-small" href="${esc(upiDeepLink)}">Pay via UPI</a>
            <button class="button button-secondary button-small" data-action="open-qr" data-idx="${idx}">Show QR</button>
          ` : `
            <button class="button button-secondary button-small" data-action="copy-payment-note" data-idx="${idx}">Copy Details</button>
          `}
          ${isAboveThreshold ? `
            <button class="button button-quiet button-small" data-action="split-threshold" data-idx="${idx}" title="Payment is above ₹2,000 threshold">
              ⚡ Split &gt; ₹2k
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  $('#app').innerHTML = `
    ${renderHeader('Settlement Plan', 'Direct peer-to-peer transfers to balance the group using Minimum Cash Flow.', `
      <button class="button button-secondary" data-view="breakdown">← Back to Shares</button>
    `)}

    <section class="panel">
      <div class="section-head">
        <div>
          <h2>${settlements.length ? `${settlements.length} Payment${settlements.length === 1 ? '' : 's'} to Balance Group` : 'All Accounts Settled!'}</h2>
          <p>Greedy cash flow algorithm minimizes the total number of transfers needed.</p>
        </div>
        <span class="pill">${formatCurrency(settlements.reduce((a, b) => a + b.amountPaise, 0))} total debt</span>
      </div>

      <div class="settlement-list">
        ${settlementsHtml || '<div class="empty"><h3>Everyone is fully settled!</h3><p>No debt transfers are required for this bill.</p></div>'}
      </div>
    </section>

    <div class="button-row">
      <button class="button button-primary" data-action="share-claim-link">Share Bill for WhatsApp Self-Claim</button>
      <button class="button button-secondary" data-action="import-claim-modal">Import WhatsApp Claim</button>
      <button class="button button-secondary" data-action="save-current-bill">Save to Recent History</button>
    </div>

    <div class="panel" style="margin-top:24px;">
      <h2>Payment Disclaimer</h2>
      <p class="panel-intro">
        Opening a UPI app or scanning a QR code generates a payment intent. It does not automatically confirm that payment was received.
        Both the sender and receiver should verify transaction success in their banking or UPI app.
      </p>
    </div>
  `;
}

/* ==========================================================================
   VIEW 7: SETTINGS
   ========================================================================== */
function renderSettings() {
  $('#app').innerHTML = `
    ${renderHeader('Settings', 'Configure optional receipt scanning, local storage, and privacy preferences.')}

    <section class="panel">
      <h2>Gemini AI Receipt Scanner (Optional)</h2>
      <div class="warning">
        🔒 <strong>Client-Side Security Notice:</strong>
        SplitSmart runs 100% in your browser. Any API key entered here is held in your browser memory and only saved locally if you explicitly choose to persist it.
        Keys are never sent to any server other than directly to Google's official Gemini API endpoint.
      </div>

      <div class="field-grid">
        <label class="full">
          Google Gemini API Key
          <input type="password" id="gemini-key-input" value="${esc(settings.apiKey)}" placeholder="AIzaSy..." autocomplete="off">
        </label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="save-key-checkbox" ${settings.saveKey ? 'checked' : ''} style="width:auto;">
          <span>Remember this key on this device (localStorage)</span>
        </label>
        <label class="full">
          Model Preference
          <select id="gemini-model-select">
            <option value="auto" ${settings.selectedModel === 'auto' ? 'selected' : ''}>Auto-detect / Fallback Cascade (Recommended)</option>
            <option value="gemini-2.5-flash" ${settings.selectedModel === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
            <option value="gemini-2.0-flash" ${settings.selectedModel === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash</option>
            <option value="gemini-1.5-flash" ${settings.selectedModel === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash</option>
            <option value="gemini-3.5-flash-lite" ${settings.selectedModel === 'gemini-3.5-flash-lite' ? 'selected' : ''}>gemini-3.5-flash-lite</option>
            <option value="gemini-3.8-flash" ${settings.selectedModel === 'gemini-3.8-flash' ? 'selected' : ''}>gemini-3.8-flash</option>
          </select>
        </label>
      </div>

      <div class="button-row">
        <button class="button button-primary button-small" data-action="save-api-key">Save Settings</button>
        <button class="button button-secondary button-small" data-action="clear-api-key">Remove Key</button>
      </div>
      <div id="test-key-result" style="margin-top:12px;font-size:13px;"></div>
    </section>

    <section class="panel">
      <h2>Data Management</h2>
      <p class="panel-intro">SplitSmart stores your groups and recent bills locally in your browser storage.</p>

      <div class="button-row">
        <button class="button button-secondary button-small" data-action="export-backup">Export Group Backup (JSON)</button>
        <button class="button button-secondary button-small" data-action="clear-history">Clear Recent Bills</button>
        <button class="button button-danger button-small" data-action="wipe-all-data">Wipe All Local Data</button>
      </div>
    </section>

    <section class="panel">
      <h2>Financial Engine Validation</h2>
      <p class="panel-intro">Run internal self-tests for mathematical invariants (proportional shares, largest remainder penny rounding, cash flow balance).</p>
      <div class="button-row">
        <button class="button button-secondary button-small" data-action="run-financial-tests">Run Calculation Checks</button>
      </div>
      <div id="test-results-output" style="margin-top:12px;font-family:var(--font-mono);font-size:12.5px;"></div>
    </section>
  `;
}

/* ==========================================================================
   VIEW 8: STATELESS SELF-CLAIM (DIRECT LINK OPEN)
   ========================================================================== */
let decodedClaimPayload = null;

function renderClaim() {
  try {
    decodedClaimPayload = decodeShare(window.location.hash);
  } catch (err) {
    $('#app').innerHTML = `
      <div class="panel" style="max-width:540px;margin:40px auto;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
        <h2>Invalid or Expired Link</h2>
        <p style="margin-bottom:20px;">${esc(err.message)}</p>
        <a class="button button-primary" href="${esc(window.location.pathname)}">Open SplitSmart Home</a>
      </div>
    `;
    return;
  }

  const p = decodedClaimPayload;

  const itemsHtml = p.items.map(it => `
    <label class="list-row" style="cursor:pointer;padding:12px 6px;">
      <input type="checkbox" data-claim-item="${esc(it.id)}" style="width:auto;margin-right:12px;">
      <div class="list-row-main">
        <div style="font-weight:600;font-size:14.5px;">${esc(it.name)}</div>
        <div class="quiet" style="font-size:12px;">Qty ${it.quantity}</div>
      </div>
      <span class="amount">${formatCurrency(it.costPaise)}</span>
    </label>
  `).join('');

  $('#app').innerHTML = `
    <div style="max-width:620px;margin:0 auto;">
      <div class="panel" style="background:var(--accent);color:white;border:none;">
        <h1 style="color:white;font-size:22px;margin-bottom:4px;">${esc(p.outing)}</h1>
        <p style="color:var(--accent-soft);font-size:13.5px;">Select the items you consumed. This creates a WhatsApp claim message to send to the host.</p>
      </div>

      <div class="panel">
        <label style="margin-bottom:18px;">
          Select Your Name
          <select id="claimant-name-select" style="font-size:15px;padding:10px;">
            <option value="">-- Choose your name --</option>
            ${p.participants.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          </select>
        </label>

        <h3 style="font-size:16px;margin-bottom:10px;">Which items did you share?</h3>
        <div class="list" style="margin-bottom:18px;">
          ${itemsHtml}
        </div>

        <button class="button button-primary" data-action="submit-whatsapp-claim" style="width:100%;">
          Generate WhatsApp Claim Message
        </button>

        <div id="claim-result-box" style="margin-top:16px;"></div>
      </div>
    </div>
  `;
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
          banner.style.boxShadow = '0 0 0 3px #f59e0b';
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
          aside.style.boxShadow = '0 0 0 3px #ef4444';
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
