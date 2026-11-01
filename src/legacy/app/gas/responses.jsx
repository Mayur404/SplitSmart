import { getOwnerResponses as gasGetOwnerResponses } from '../../form-bridge.jsx';
import { unrollItem } from '../../algorithm.jsx';
import { S, currentBill, members, toast } from '../core.jsx';
import { gasResponseCache, gasResponseUpdatedAt, readGasBillMeta, readSavedClaimLinks, saveGasResponsesSnapshot } from './storage.jsx';
import { saveCurrentOutingToRecent } from '../outing.jsx';
import { renderAssign } from '../views/assign.jsx';

export function renderGasResponses(rows = [], { updatedAt = null, loading = false } = {}) {
  const app = document.getElementById('app');
  if (!app) return;

  // Customer submissions belong only to the Assign / Review shares step.
  if (S.view !== 'assign') {
    document.getElementById('formbridge-live-responses')?.remove();
    return;
  }

  const activeBillForPanel = currentBill();
  if (!activeBillForPanel?.id) {
    document.getElementById('formbridge-live-responses')?.remove();
    return;
  }

  let box = document.getElementById('formbridge-live-responses');
  // Do not reuse a previous bill's response panel for another bill.
  if (box && box.dataset.billId !== String(activeBillForPanel.id)) {
    box.remove();
    box = null;
  }
  if (!box) {
    box = document.createElement('section');
    box.id = 'formbridge-live-responses';
    box.className = 'panel gas-responses-panel';
    app.appendChild(box);
  }
  box.dataset.billId = String(activeBillForPanel.id);
  box.replaceChildren();
  const header = document.createElement('div');
  header.className = 'gas-responses-header';
  const heading = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = `Common Claims (${(rows || []).length})`;
  heading.append(title);
  const update = document.createElement('button');
  update.type = 'button';
  update.className = 'button button-primary gas-update-button';
  update.dataset.action = 'refresh-gas-responses';
  update.disabled = loading;
  update.textContent = loading ? 'Updating…' : 'Update from Google Sheets';
  header.append(heading, update);
  box.appendChild(header);

  const controls = document.createElement('div');
  controls.className = 'gas-claim-controls';
  controls.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 0 18px;';

  const presentLink = document.createElement('button');
  presentLink.type = 'button';
  presentLink.className = 'button button-secondary';
  presentLink.textContent = 'Present existing link';
  presentLink.addEventListener('click', async () => {
    const bill = currentBill();
    if (!bill) {
      toast('Open the bill whose claim link you want to copy.', true);
      return;
    }

    const meta = readGasBillMeta(bill);
    if (!meta?.formId) {
      toast('No saved claim link exists yet. Use Share claim link to create it.', true);
      return;
    }

    const saved = readSavedClaimLinks(meta.formId);
    const link = saved?.commonLink;
    if (!link) {
      toast('No saved common claim link was found for this bill. Use Share claim link to create and save it.', true);
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      toast('Existing claim link copied. No new form was created.');
    } catch (error) {
      // Clipboard API may be unavailable on non-secure/local browser contexts.
      const temporary = document.createElement('textarea');
      temporary.value = link;
      temporary.setAttribute('readonly', '');
      temporary.style.position = 'fixed';
      temporary.style.opacity = '0';
      document.body.appendChild(temporary);
      temporary.select();
      const copied = document.execCommand('copy');
      temporary.remove();
      if (copied) {
        toast('Existing claim link copied. No new form was created.');
      } else {
        window.prompt('Copy your existing claim link:', link);
      }
    }
  });
  controls.appendChild(presentLink);



  box.appendChild(controls);

  const responses = Array.isArray(rows) ? rows : [];
  if (!responses.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    const emptyTitle = document.createElement('h3');
     emptyTitle.textContent = 'No claims yet';
     empty.append(emptyTitle);
    box.appendChild(empty);
    return;
  }
  const list = document.createElement('div');
  list.className = 'list';
  responses.forEach(row => {
    const answers = row.answers || {};
    const card = document.createElement('article');
    card.className = 'panel gas-response-card';
    const customerName = document.createElement('h3');
    customerName.textContent = answers['Customer name'] || answers.Name || 'Customer response';
    const customerId = document.createElement('p');
    customerId.className = 'quiet';
    customerId.textContent = `Customer ID: ${row.customerId || row.responseId || 'Unavailable'}`;
    const submittedAt = document.createElement('p');
    submittedAt.className = 'quiet';
    const date = row.submittedAt ? new Date(row.submittedAt) : null;
    submittedAt.textContent = date && !Number.isNaN(date.getTime()) ? `Submitted: ${date.toLocaleString()}` : 'Submission time unavailable';
    card.append(customerName, customerId, submittedAt);
    Object.entries(answers).forEach(([key, value]) => {
      if (value == null || value === '' || ['Customer name', 'Name', 'Participant ID'].includes(key)) return;
      const field = document.createElement('div');
      field.className = 'gas-response-field';
      const label = document.createElement('strong');
      label.textContent = `${key}: `;
      const content = document.createElement('span');
      if (key === 'Claimed item details') {
        try {
          const items = typeof value === 'string' ? JSON.parse(value) : value;
          content.textContent = Array.isArray(items) ? items.map(item => `${item.name || 'Item'}${Number(item.quantity) > 1 ? ` × ${item.quantity}` : ''}${item.amount ? ` — ${item.amount}` : ''}`).join(', ') : String(value);
        } catch { content.textContent = String(value); }
      } else content.textContent = String(value);
      field.append(label, content);
      card.appendChild(field);
    });
    list.appendChild(card);
  });
  box.appendChild(list);
}

// Apply ONLY the latest Google Sheets submission for each customer.
// Older submissions from the same customer are ignored and previous auto-claims
// are reconciled so an updated submission replaces, rather than accumulates, items.
export function applyGasClaimsToAssignments(rows) {
  const bill = currentBill();
  const groupMembers = members();
  if (!bill || !Array.isArray(rows) || !groupMembers.length) return false;

  const normalize = value => String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase();
  const submittedTime = row => {
    const time = new Date(row?.submittedAt || 0).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  // Keep the newest row for each customer name, using submission timestamp.
  // responseId is a tie-breaker when timestamps are identical.
  const latestByCustomer = new Map();
  rows.forEach(row => {
    const answers = row?.answers || {};
    const customerName = answers['Customer name'] || answers['Name'] || '';
    const participantId = row?.answers?.['Participant ID'] || row?.participantId || '';
    const customerKey = participantId ? `id:${participantId}` : `name:${normalize(customerName)}`;
    if (!customerName || customerKey === 'name:') return;
    const current = latestByCustomer.get(customerKey);
    const currentTime = current ? submittedTime(current) : -1;
    const rowTime = submittedTime(row);
    if (!current || rowTime > currentTime ||
        (rowTime === currentTime && String(row.responseId || '') > String(current.responseId || ''))) {
      latestByCustomer.set(customerKey, row);
    }
  });

  // Resolve each latest customer submission to exactly one member and bill items.
  const desiredByMember = new Map();
  let changedStructure = false;
  latestByCustomer.forEach(row => {
    const answers = row?.answers || {};
    const customerName = answers['Customer name'] || answers['Name'] || '';
    const participantId = answers['Participant ID'] || row.participantId || '';
    const idMatch = participantId ? groupMembers.find(member => member.id === participantId) : null;
    const matches = idMatch ? [idMatch] : groupMembers.filter(member => normalize(member.name) === normalize(customerName));
    if (matches.length !== 1) {
      if (matches.length > 1) console.warn('Latest claim not auto-assigned: ambiguous member name', customerName);
      return;
    }
    const memberId = matches[0].id;
    let claims = [];
    const details = answers['Claimed item details'];
    if (details) {
      try {
        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
        if (Array.isArray(parsed)) claims = parsed;
      } catch (error) {
        console.warn('Could not parse latest claimed item details:', error);
      }
    }
    if (!claims.length && answers['Claimed items']) {
      claims = String(answers['Claimed items']).split(',').map(name => name.trim())
        .filter(Boolean).map(name => ({ name }));
    }

    const itemIds = new Set();
    claims.forEach(claim => {
      const id = claim?.id || claim?.itemId || '';
      const name = claim?.name || claim?.itemName || (typeof claim === 'string' ? claim : '');
      const units = Array.isArray(claim?.units) ? claim.units : [];
      let item = id ? bill.items.find(candidate => candidate.id === id) : null;

      // Claim for specific units of a multi-quantity item: map them to the host's unrolled items,
      // unrolling the original item first when the host has not done so yet.
      if (id && units.length) {
        if (item && !item.unrolledFrom) {
          const unrolled = unrollItem(item);
          if (unrolled) {
            bill.items.splice(bill.items.indexOf(item), 1, ...unrolled);
            changedStructure = true;
          }
        }
        units.forEach(n => {
          const unitItem = bill.items.find(candidate => candidate.id === `${id}-u${n}`);
          if (unitItem) itemIds.add(unitItem.id);
        });
        if (bill.items.some(candidate => candidate.unrolledFrom === id)) return;
      }

      if (!item && id && !units.length) {
        // Whole item claimed, but the host has since unrolled it: claim every unit.
        const hostUnits = bill.items.filter(candidate => candidate.unrolledFrom === id);
        if (hostUnits.length) { hostUnits.forEach(unit => itemIds.add(unit.id)); return; }
      }
      if (!item && name) {
        const itemMatches = bill.items.filter(candidate => normalize(candidate.name) === normalize(name));
        if (itemMatches.length === 1) item = itemMatches[0];
        else if (itemMatches.length > 1) console.warn('Latest claim item name is ambiguous:', name);
      }
      if (item) itemIds.add(item.id);
    });
    desiredByMember.set(memberId, [...itemIds]);
  });

  // Store which assignments were added by claim sync, so the next poll can remove
  // stale auto-claims when that customer submits a replacement. Key by bill ID.
  const storageKey = `splitsmart-gas-auto-claims:${bill.id || 'current-bill'}`;
  let previous = {};
  try { previous = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch { previous = {}; }
  let changed = changedStructure;

  // Remove previously auto-assigned items that are no longer in the latest claim.
  Object.entries(previous).forEach(([memberId, oldItemIds]) => {
    const desired = new Set(desiredByMember.get(memberId) || []);
    (Array.isArray(oldItemIds) ? oldItemIds : []).forEach(itemId => {
      if (desired.has(itemId)) return;
      const item = bill.items.find(candidate => candidate.id === itemId);
      if (item && Array.isArray(item.assignments) && item.assignments.includes(memberId)) {
        item.assignments = item.assignments.filter(id => id !== memberId);
        changed = true;
      }
    });
  });

  // Apply the latest claims only; repeated polling is idempotent.
  const nextStored = {};
  desiredByMember.forEach((itemIds, memberId) => {
    nextStored[memberId] = itemIds;
    itemIds.forEach(itemId => {
      const item = bill.items.find(candidate => candidate.id === itemId);
      if (!item) return;
      item.assignments = Array.isArray(item.assignments) ? item.assignments : [];
      if (!item.assignments.includes(memberId)) {
        item.assignments.push(memberId);
        changed = true;
      }
    });
  });

  try { localStorage.setItem(storageKey, JSON.stringify(nextStored)); } catch (error) {
    console.warn('Could not persist latest claim assignment state:', error);
  }
  return changed;
}

export async function refreshGasResponses() {
  if (S.gasRefreshInFlight) return;
  const bill = currentBill();
  const meta = readGasBillMeta(bill);
  if (!bill || !meta?.ownerKey || !meta?.formId) {
    toast('Create a claim link for this bill first.', true);
    return;
  }
  S.gasRefreshInFlight = true;
  renderGasResponses([], { loading: true });
  try {
    const rows = await gasGetOwnerResponses(meta.ownerKey);
    const safeRows = (Array.isArray(rows) ? rows : []).filter(row => row.formId === meta.formId);
    gasResponseCache.set(bill.id, safeRows);
    const syncedAt = new Date().toISOString();
    gasResponseUpdatedAt.set(bill.id, syncedAt);
    saveGasResponsesSnapshot(meta.formId, safeRows, syncedAt);
    const changed = applyGasClaimsToAssignments(safeRows);
    if (changed) {
      if (S.view === 'assign') renderAssign();
      saveCurrentOutingToRecent();
    }
    renderGasResponses(safeRows, { updatedAt: gasResponseUpdatedAt.get(bill.id) });
    toast(`Updated ${safeRows.length} customer claim${safeRows.length === 1 ? '' : 's'} for this bill.`);
  } catch (error) {
    gasResponseCache.set(bill.id, []);
    gasResponseUpdatedAt.delete(bill.id);
    renderGasResponses([], { updatedAt: null });
    toast(`Could not update claims: ${error.message}`, true);
    console.error('Manual Google Sheets update failed:', error);
  } finally {
    S.gasRefreshInFlight = false;
    const button = document.querySelector('#formbridge-live-responses [data-action="refresh-gas-responses"]');
    if (button) { button.disabled = false; button.textContent = '↻ Update from Google Sheets'; }
  }
}
