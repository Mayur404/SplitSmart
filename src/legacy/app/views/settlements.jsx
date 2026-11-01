/** SplitSmart — Settlements view. */
import { formatCurrency, netBalances, minimumCashFlow } from '../../algorithm.jsx';
import { paymentUri, isValidUpiId } from '../../qr.jsx';
import { $, S, esc, icon } from '../core.jsx';
import { go } from '../router.jsx';
import { computeBillShares } from './breakdown.jsx';
import { renderHeader, renderWorkflow } from './chrome.jsx';

export function renderSettlements() {
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
      <div class="settlement-page">
      ${renderHeader('Settlement Plan Error', 'Unable to balance cash flow.')}
      <div class="panel">
        <div class="warning">${esc(err.message)}</div>
        <button class="button button-primary" data-view="breakdown">${icon('arrowLeft')} Return to shares &amp; payments</button>
      </div>
      </div>
    `;
    return;
  }

  const thresholdPaise = S.settings.upiThresholdPaise || 200000; // ₹2,000

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

        <div class="settlement-arrow" aria-hidden="true">${icon('arrowRight')}</div>

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
              ${icon('warning')} Split &gt; ₹2k
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  $('#app').innerHTML = `
    <div class="settlement-page">
    ${renderHeader('Settle up', 'A short list of direct transfers.', `
      <button class="button button-secondary" data-view="breakdown">${icon('arrowLeft')} Back to shares</button>
    `)}
    ${renderWorkflow('settlements')}

    <section class="panel">
      <div class="section-head">
        <div>
          <h2>${settlements.length ? `${settlements.length} Payment${settlements.length === 1 ? '' : 's'} to Balance Group` : 'All Accounts Settled!'}</h2>
          <p>Minimum Cash Flow keeps the list short.</p>
        </div>
        <span class="pill">${formatCurrency(settlements.reduce((a, b) => a + b.amountPaise, 0))} total debt</span>
      </div>

      <div class="settlement-list">
        ${settlementsHtml || '<div class="empty"><h3>Everyone is fully settled!</h3><p>No debt transfers are required for this bill.</p></div>'}
      </div>
    </section>

    <div class="button-row">
       <button class="button button-secondary" data-action="save-current-bill">Save bill</button>
    </div>

    <div class="panel" style="margin-top:24px;">
       <h2>Payment note</h2>
      <p class="panel-intro">
         UPI links and QR codes create payment intents. Confirm the transfer in your banking app.
      </p>
    </div>
    </div>
  `;
}
