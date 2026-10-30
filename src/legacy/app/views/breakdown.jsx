/* eslint-disable react-refresh/only-export-components */
/**
 * BreakdownView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildBreakdownMarkup(ctx) {
  const { computeBillShares, go, activeGroup, members, esc, formatCurrency, renderHeader } = ctx;

  const calc = computeBillShares();
  if (!calc) {
    go('bill');
    return;
  }

  const bill = calc.bill;
  const unassigned = calc.items.filter((i) => !i.assignments || i.assignments.length === 0);
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

  const participantRows = calc.shares
    .map((s) => {
      const paid = (bill.payers || [])
        .filter((p) => p.memberId === s.memberId)
        .reduce((a, b) => a + b.amountPaise, 0);
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
    })
    .join('');

  return `
    ${renderHeader(
      'Review shares',
      'Check each share and record who paid.',
      `
      <button class="button button-secondary" data-action="back-to-assign">← Edit Assignments</button>
    `,
    )}

    ${
      hasUnassigned
        ? `
      <div class="warning" id="unassigned-banner" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px;padding:12px 16px;">
        <div style="flex:1;min-width:260px;">
          <div style="font-weight:700;font-size:14px;">⚠️ ${unassigned.length} item${unassigned.length === 1 ? '' : 's are'} unassigned!</div>
          <div style="font-size:12.5px;margin-top:2px;color:var(--text);">
            Unassigned: ${unassigned.map((u) => `<strong style="text-decoration:underline;">${esc(u.name)}</strong>`).join(', ')}.
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
    `
        : ''
    }

    <div class="columns">
      <section>
        <div class="panel billing-theme-card" id="review-shares-card">
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
          <h2>Who paid?</h2>
          <p class="panel-intro">Record the amount each person paid.</p>

          <div class="payer-list" style="display:flex;flex-direction:column;gap:10px;">
            ${calc.members
              .map((m) => {
                const currentPaid =
                  (bill.payers || []).find((p) => p.memberId === m.id)?.amountPaise || 0;
                return `
                <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <span style="font-size:13.5px;font-weight:600;min-width:70px;">${esc(m.name)}</span>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <label class="payer-amount-field">
                      <span style="font-size:13px;color:var(--muted);">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        class="payer-amount-input"
                        data-validate="payer-amount"
                        required
                        max="99999999.99"
                        data-member-id="${esc(m.id)}"
                        value="${(currentPaid / 100).toFixed(2)}"
                        style="max-width:105px;text-align:right;">
                    </label>
                    <button type="button" class="button button-small button-secondary" data-action="fill-remaining-payer" data-member-id="${esc(m.id)}" title="Fill remaining unpaid balance to ${esc(m.name)}" style="padding:4px 8px;font-size:11px;white-space:nowrap;">+ Rest</button>
                  </div>
                </div>
              `;
              })
              .join('')}
          </div>

          <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">
            <div class="total-line">
              <span>Total Recorded Paid</span>
              <strong class="amount" id="payer-total-display">${formatCurrency(totalPaidPaise)}</strong>
            </div>
            <div id="payer-status-msg" role="status" aria-live="polite">
              ${
                !payersBalanced
                  ? `
                <div class="warning" style="font-size:12.5px;margin-top:8px;">
                  Recorded payments (${formatCurrency(totalPaidPaise)}) must equal the bill grand total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(payerDifference))}.
                </div>
              `
                  : `
                <div class="success" style="font-size:12.5px;padding:8px 12px;margin-top:8px;">
                  ✓ Total paid matches bill total (${formatCurrency(calc.grandTotal)}).
                </div>
              `
              }
            </div>
          </div>

          <div style="margin-top:12px;">
            <button type="button" class="button button-primary button-small" data-action="apply-payers" style="width:100%;">
              Update Calculations
            </button>
          </div>

          <div class="button-row" style="margin-top:8px;">
            <button class="button button-secondary button-small" data-action="set-first-payer">First person pays all</button>
            <button class="button button-secondary button-small" data-action="split-payers-equally">Split equally</button>
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

export default function BreakdownView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="breakdown"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
