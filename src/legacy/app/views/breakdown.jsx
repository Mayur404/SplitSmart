import { toPaise, formatCurrency, calculateShares } from '../../algorithm.jsx';
import { $$, $, S, currentBill, esc, icon, members, toast } from '../core.jsx';
import { go } from '../router.jsx';
import { renderHeader, renderWorkflow } from './chrome.jsx';

export function computeBillShares() {
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

export function renderBreakdown() {
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
    const defaultPayerId = S.activeGroup?.primaryPayerId || members()[0]?.id;
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
    <div class="breakdown-page">
    ${renderHeader('Review shares', 'Check each share and record who paid.', `
      <button class="button button-secondary" data-action="back-to-assign">${icon('arrowLeft')} Edit assignments</button>
    `)}
    ${renderWorkflow('breakdown')}

    ${hasUnassigned ? `
      <div class="remaining-items-card" id="unassigned-banner">
        <div class="remaining-items-copy">
          <div class="remaining-items-title">${icon('warning')} Assign ${unassigned.length} remaining item${unassigned.length === 1 ? '' : 's'}</div>
          <div class="remaining-items-list">${unassigned.map(u => `<strong>${esc(u.name)}</strong>`).join('<span aria-hidden="true"> · </span>')}</div>
        </div>
        <div class="remaining-items-actions">
          <button type="button" class="button button-small button-secondary" data-action="quick-split-unassigned">Split remaining</button>
          <button type="button" class="button button-small button-primary" data-action="back-to-assign">Assign manually ${icon('arrowRight')}</button>
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
          <h2>Who paid?</h2>
          <p class="panel-intro">Record the amount each person paid.</p>

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
                   ${icon('check')} Total paid matches bill total (${formatCurrency(calc.grandTotal)}).
                </div>
              `}
            </div>
          </div>

          <div style="margin-top:12px;">
            <button type="button" class="button button-primary button-small" data-action="apply-payers" style="width:100%;">
              Update
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
        Generate settlement plan ${icon('arrowRight')}
      </button>
       <button class="button button-secondary" data-action="save-current-bill">Save bill</button>
    </div>
    </div>
  `;
}

// Live Summary for Payer Inputs (Runs without re-rendering or stealing input focus)
export function updateLivePayerSummary() {
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
           ${icon('check')} Total paid matches bill total (${formatCurrency(calc.grandTotal)}). Click "Update Calculations" to apply.
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
export function applyPayerAmounts(showToast = true) {
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
      toast(`Payments recorded (${formatCurrency(totalPaid)}) do not equal the bill total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diff))}.`, true);
    }
  } else {
    if (showToast) {
      toast('Payments updated and calculations balanced.');
    }
  }

  renderBreakdown();
  return diff === 0;
}
