/* eslint-disable react-refresh/only-export-components */
/**
 * AssignmentView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildAssignmentMarkup(ctx) {
  const {
    currentBill,
    go,
    members,
    assignmentDietFilter,
    assignmentSearchQuery,
    formatCurrency,
    esc,
    renderHeader,
    previousUnrolls,
  } = ctx;

  const bill = currentBill();
  if (!bill) {
    go('bill');
    return;
  }

  const items = bill.items || [];
  const groupMembers = members();
  const unassignedCount = items.filter((i) => !i.assignments || i.assignments.length === 0).length;

  // Filter members based on tab and search
  const filteredMembers = groupMembers.filter((m) => {
    if (assignmentDietFilter !== 'ALL' && m.dietaryTag !== assignmentDietFilter) return false;
    if (
      assignmentSearchQuery &&
      !m.name.toLowerCase().includes(assignmentSearchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  const itemsHtml = items
    .map((it, idx) => {
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
          ${filteredMembers
            .map((m) => {
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
            })
            .join('')}
        </div>

        <div class="quiet" style="font-size:12px;margin-top:8px;">
          ${isUnassigned ? '<span style="color:var(--warning)">⚠️ Unassigned</span>' : `Shared by ${assignedIds.size} (${[...assignedIds].map((id) => esc(groupMembers.find((m) => m.id === id)?.name || 'Unknown')).join(', ')})`}
        </div>
      </div>
    `;
    })
    .join('');

  return `
    ${renderHeader(
      'Assign',
      'Choose who shared each item.',
      `
      <button class="button button-secondary" data-action="back-to-bill">← Edit Bill</button>
    `,
    )}

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
        <input type="text" id="command-input" data-validate="command" required maxlength="300" placeholder="e.g. 'Assign naan to everyone', 'Put coffee on Sneha', 'Clear item 1'" autocomplete="off">
        <button class="button button-secondary button-small" id="mic-btn" data-action="voice-command" title="Voice command (Speech Recognition)">🎤</button>
        <button class="button button-primary button-small" data-action="run-command">Apply</button>
      </div>
      <p class="quiet" style="font-size:12px;margin-top:6px;">Deterministic in-browser matching. No cloud AI or speech audio transmission.</p>
    </div>

    <!-- Group Filter Bar (Useful for up to 30 people) -->
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0;">
      <div class="tabs" style="margin:0;">
        <button class="tab ${assignmentDietFilter === 'ALL' ? 'active' : ''}" data-action="filter-diet" data-filter="ALL">All (${groupMembers.length})</button>
        <button class="tab ${assignmentDietFilter === 'VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="VEG">VEG (${groupMembers.filter((m) => m.dietaryTag === 'VEG').length})</button>
        <button class="tab ${assignmentDietFilter === 'NON-VEG' ? 'active' : ''}" data-action="filter-diet" data-filter="NON-VEG">NON-VEG (${groupMembers.filter((m) => m.dietaryTag === 'NON-VEG').length})</button>
      </div>
      <input type="search" data-validate="optional-text" maxlength="60" id="assign-member-search" placeholder="Filter member chips by name…" value="${esc(assignmentSearchQuery)}" style="max-width:260px;height:34px;padding:4px 10px;font-size:13px;">
    </div>

    <section class="panel">
      <div id="assignment-list">
        ${itemsHtml || '<p class="quiet">No items to assign.</p>'}
      </div>
    </section>

    <section class="review-shares-card billing-theme-card" aria-labelledby="review-shares-title">
      <div>
        <h2 id="review-shares-title">Review Shares</h2>
        <p>Check each participant’s food share, proportional tax and discount, and payment balance before generating the final settlement.</p>
      </div>
      <div class="button-row" style="margin:0;">
        <button class="button button-primary" data-action="go-to-breakdown">Review Shares →</button>
        <button class="button button-secondary" data-action="share-claim-link">Share Bill for Claims</button>
      </div>
    </section>
  `;
}

export default function AssignmentView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="assignment"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
