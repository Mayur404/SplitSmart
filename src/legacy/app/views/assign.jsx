/** SplitSmart — Item assignment view. */
import { formatCurrency } from '../../algorithm.jsx';
import { $$, $, S, currentBill, esc, icon, members } from '../core.jsx';
import { renderGasResponses } from '../gas/responses.jsx';
import { gasResponseCache, gasResponseUpdatedAt, readGasBillMeta, readSavedGasResponses } from '../gas/storage.jsx';
import { go } from '../router.jsx';
import { renderHeader, renderWorkflow } from './chrome.jsx';
import { syncClaim } from './claim.jsx';

export function renderAssign() {
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
    if (S.assignmentDietFilter !== 'ALL' && m.dietaryTag !== S.assignmentDietFilter) return false;
    if (S.assignmentSearchQuery && !m.name.toLowerCase().includes(S.assignmentSearchQuery.toLowerCase())) return false;
    return true;
  });

  const enter = S.assignAnimate;
  S.assignAnimate = false;

  // The "active person" is who the dish rows act on. Falls back to the first visible person.
  if (!filteredMembers.some(m => m.id === S.assignActiveMemberId)) S.assignActiveMemberId = filteredMembers[0]?.id || '';
  const activeMember = groupMembers.find(m => m.id === S.assignActiveMemberId) || null;
  const initial = n => esc(((n || '').trim()[0] || '?').toUpperCase());
  const countFor = id => items.filter(it => (it.assignments || []).includes(id)).length;

  const peopleHtml = filteredMembers.map(m => {
    const on = m.id === S.assignActiveMemberId;
    const n = countFor(m.id);
    return `
      <button type="button" class="claim-person ap-person${on ? ' is-selected' : ''}" role="radio" aria-checked="${on}"
        data-action="select-assignee" data-member-id="${esc(m.id)}"
        data-dnd="person" data-person-id="${esc(m.id)}" data-person-name="${esc(m.name)}">
        <span class="cp-body">
          <span class="cp-avatar" aria-hidden="true">${initial(m.name)}</span>
          <span class="cp-name">${esc(m.name)}</span>
          ${n ? `<span class="ap-count" aria-label="${n} dishes">${n}</span>` : ''}
        </span>
      </button>`;
  }).join('');

  const renderAssignmentCard = (it, idx) => {
    const assignedIds = new Set(it.assignments || []);
    const count = assignedIds.size;
    const state = count === 0 ? 'unassigned' : count === 1 ? 'solo' : 'shared';
    const mine = !!activeMember && assignedIds.has(activeMember.id);
    const lineTotal = formatCurrency(it.totalPaise);
    const canUnroll = Math.trunc(Number(it.quantity)) > 1 && !it.unrolledFrom;
    const groupSize = it.unrolledFrom ? items.filter(x => x.unrolledFrom === it.unrolledFrom).length : 0;
    const canRegroup = groupSize > 1 && items.findIndex(x => x.unrolledFrom === it.unrolledFrom) === idx;
    const names = [...assignedIds].map(id => groupMembers.find(m => m.id === id)?.name || 'Unknown');
    const status = names.length
      ? `<span class="ai-status is-ok"><span class="ai-names">${esc(names.join(', '))}</span></span>`
      : '';
    const label = `${it.name || 'Unnamed item'}, ${lineTotal}${activeMember ? (mine ? `, assigned to ${activeMember.name}` : `, tap to give to ${activeMember.name}`) : ''}`;

    return `
      <article class="claim-item assign-row${mine ? ' is-selected' : ''}" data-state="${state}" data-item-idx="${idx}" style="--i:${Math.min(idx, 8)}"
        data-dnd="item" data-item-id="${esc(it.id)}" data-item-name="${esc(it.name || 'Unnamed item')}" data-item-amount="${esc(lineTotal)}"
        data-members="${esc(JSON.stringify([...assignedIds]))}">
        <button type="button" class="ci-input ar-hit" data-action="toggle-assignment" data-item-id="${esc(it.id)}" data-member-id="${esc(activeMember?.id || '')}" aria-pressed="${mine}" aria-label="${esc(label)}"></button>
        <span class="ci-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" pathLength="1"/></svg></span>
        <span class="ci-main">
          <span class="ci-name">${esc(it.name || 'Unnamed Item')}</span>
          <span class="ci-meta"><span class="ci-qty">${Math.trunc(Number(it.quantity)) > 1 ? `× ${esc(it.quantity)}` : 'Qty 1'}</span>
            <span class="pill ${it.category === 'VEG' ? 'pill-veg' : it.category === 'NON-VEG' ? 'pill-non-veg' : ''}">${esc(it.category)}</span></span>
           ${status ? `<span class="ar-status">${status}</span>` : ''}
        </span>
        <span class="ar-side">
          <span class="ci-price">${lineTotal}</span>
          ${canUnroll ? `<button type="button" class="button button-quiet button-small ai-unroll" data-action="unroll-single" data-idx="${idx}">Split into units</button>` : ''}
          ${canRegroup ? `<button type="button" class="button button-quiet button-small ai-unroll" data-action="regroup-units" data-group="${esc(it.unrolledFrom)}" aria-label="Unroll Quantity: combine these ${groupSize} units back into one item">Unroll Quantity</button>` : ''}
        </span>
      </article>`;
  };

  const itemsHtml = items.map((it, idx) => {
    if (it.unrolledFrom) {
      const firstUnitIndex = items.findIndex(item => item.unrolledFrom === it.unrolledFrom);
      if (firstUnitIndex !== idx) return '';
      const units = items
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => item.unrolledFrom === it.unrolledFrom);
      const parentName = String(it.name || 'Item').replace(/\s*\(\d+\/\d+\)\s*$/, '');
      return `<div class="assign-unit-group" data-unit-group="${esc(it.unrolledFrom)}">
        <div class="assign-unit-label">${esc(parentName)} · ${units.length} units</div>
        ${renderAssignmentCard(it, idx)}
        ${units.slice(1).map(({ item, itemIndex }) => renderAssignmentCard(item, itemIndex)).join('')}
      </div>`;
    }
    return renderAssignmentCard(it, idx);
  }).join('');

  $('#app').innerHTML = `
    <div class="assign-page${enter ? ' is-entering' : ''}">
    ${renderHeader('Assign', 'Choose who shared each item.', `
      <button class="button button-secondary" data-action="back-to-bill">${icon('arrowLeft')} Edit bill</button>
    `)}
    ${renderWorkflow('assign')}

    <div class="panel" style="background:var(--surface-alt);">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;">
        <div class="button-row" style="margin:0;">
           <button class="button button-secondary button-small" data-action="auto-split-diet">Auto-split by diet</button>
          <button class="button button-secondary button-small" data-action="split-remaining-equally">Split all</button>
          <button class="button button-secondary button-small" data-action="unroll-all">Unroll quantities</button>
          ${S.previousUnrolls.length ? '<button class="button button-quiet button-small" data-action="undo-unroll">Undo Unroll</button>' : ''}
        </div>
         <span class="assign-count" aria-label="${unassignedCount} unassigned items">${unassignedCount} unassigned</span>
      </div>

      <!-- Natural Language Command Bar -->
      <div class="command-bar">
         <input type="text" id="command-input" placeholder="Assign items, split bills, or clear assignments..." autocomplete="off">
          <button class="button button-secondary button-small voice-control icon-only" id="mic-btn" data-action="voice-command" title="Voice command" aria-label="Start voice command">${icon('mic')}</button>
        <button class="button button-primary button-small" data-action="run-command">Apply</button>
      </div>
    </div>

    <!-- Group Filter Bar (Useful for up to 30 people) -->
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0;">
      <div class="tabs" style="margin:0;">
        <button class="tab ${S.assignmentDietFilter === 'ALL' ? 'active' : ''}" data-action="filter-diet" data-filter="ALL">All (${groupMembers.length})</button>
        <button class="tab ${S.assignmentDietFilter === 'VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="VEG">VEG (${groupMembers.filter(m => m.dietaryTag === 'VEG').length})</button>
        <button class="tab ${S.assignmentDietFilter === 'NON-VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="NON-VEG">NON-VEG (${groupMembers.filter(m => m.dietaryTag === 'NON-VEG').length})</button>
      </div>
    </div>

    <div class="assign-split">
      <fieldset class="claim-who assign-who">
        <legend>Who are you assigning?</legend>
        <div class="claim-people ap-people${activeMember ? ' has-selection' : ''}" role="radiogroup" aria-label="Person">${peopleHtml || '<p class="quiet">No people match this filter.</p>'}</div>
      </fieldset>

      <section class="claim-items" aria-label="Dishes on this bill">
        <h2 class="claim-section-title">${activeMember ? `What did ${esc(activeMember.name)} share?` : 'What was shared?'}</h2>
        <div id="assignment-list" class="claim-grid assign-grid">
          ${itemsHtml || '<p class="quiet">No items to assign.</p>'}
        </div>
      </section>
    </div>

    <div class="button-row">
      <button class="button button-primary" data-action="go-to-breakdown">Review shares ${icon('arrowRight')}</button>
       <button class="button button-secondary" data-action="open-customer-claims">Customer Claims</button>
      <button class="button button-secondary" data-action="get-personal-claim-link">Get Personal Claim Link</button>
    </div>
    </div>
  `;

  // Re-attach the Customer Submissions card after every Assign-step redraw.
  // Selecting a different person calls renderAssign() directly, replacing #app.innerHTML.
  // The response panel must therefore be restored independently of S.assignActiveMemberId.
  const panelBill = currentBill();
  const panelMeta = readGasBillMeta(panelBill);
  if (S.view === 'assign' && panelBill?.id && panelMeta?.formId && panelMeta?.ownerKey) {
    const snapshot = readSavedGasResponses(panelMeta.formId);
    const cachedRows = gasResponseCache.has(panelBill.id)
      ? gasResponseCache.get(panelBill.id)
      : snapshot.rows;
    gasResponseCache.set(panelBill.id, cachedRows);
    if (snapshot.updatedAt) gasResponseUpdatedAt.set(panelBill.id, snapshot.updatedAt);
    renderGasResponses(
      cachedRows,
      { updatedAt: gasResponseUpdatedAt.get(panelBill.id) || snapshot.updatedAt || null }
    );
  }
}

export function toggleItemAssignment(itemId, memberId) {
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
  // The card is re-rendered, so hand keyboard focus back to the control that was just used.
  if (!document.querySelector('.food-bubble')) $(`.assign-row[data-item-id="${CSS.escape(itemId)}"] .ar-hit`)?.focus({ preventScroll: true });
}

// Assignment requests from the food-selection bubble (motion.jsx) reuse the same toggle rules.
document.addEventListener('splitsmart:assign', e => {
  const { itemId, memberId } = e.detail || {};
  if (S.view === 'assign') {
    S.assignActiveMemberId = memberId;          // the scroll picker also selects that person
    toggleItemAssignment(itemId, memberId);
  } else if (S.view === 'claim' && $('.claim-page')) {
    // Claims page: the "member" is the claimant's name. Switching person starts a fresh claim.
    const radio = Array.from($$('input[data-claimant]')).find(r => r.dataset.participantId === memberId || r.value === memberId);
    const box = Array.from($$('[data-claim-item]')).find(c => c.dataset.claimItem === itemId);
    if (!radio || !box) return;
    if (!radio.checked) { radio.checked = true; $$('[data-claim-item]').forEach(c => { c.checked = false; }); box.checked = true; }
    else box.checked = !box.checked;
    syncClaim();
  }
});
