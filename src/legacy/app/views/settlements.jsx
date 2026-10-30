/* eslint-disable react-refresh/only-export-components */
/**
 * SettlementsView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildSettlementsMarkup(ctx) {
  const {
    computeBillShares,
    go,
    netBalances,
    minimumCashFlow,
    renderHeader,
    esc,
    settings,
    isValidUpiId,
    paymentUri,
    formatCurrency,
  } = ctx;

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
    return `
      ${renderHeader('Settlement Plan Error', 'Unable to balance cash flow.')}
      <div class="panel">
        <div class="warning">${esc(err.message)}</div>
        <button class="button button-primary" data-view="breakdown">← Return to Shares &amp; Payments</button>
      </div>
    `;
  }

  const thresholdPaise = settings.upiThresholdPaise || 200000; // ₹2,000

  const settlementsHtml = settlements
    .map((st, idx) => {
      const creditorMember = calc.members.find((m) => m.id === st.creditor);
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
            note: `SplitSmart - ${bill.restaurantName || 'Bill'}`,
          });
        } catch {
          /* A malformed optional UPI deep link falls back to manual details. */
        }
      }

      return `
      <div class="settlement" data-settlement-idx="${idx}">
        <div class="settlement-payer">
          <strong>${esc(st.debtorName)}</strong>
          <span class="quiet">owes</span>
          <div class="pay-actions">
          ${
            hasUpi
              ? `
            <a class="button button-primary button-small" href="${esc(upiDeepLink)}">Pay via UPI</a>
            <button class="button button-secondary button-small" data-action="open-qr" data-idx="${idx}">Show QR</button>
          `
              : `
            <button class="button button-secondary button-small" data-action="copy-payment-note" data-idx="${idx}">Copy Details</button>
          `
          }
          ${
            isAboveThreshold
              ? `
            <button class="button button-quiet button-small" data-action="split-threshold" data-idx="${idx}" title="Payment is above ₹2,000 threshold">
              ⚡ Split &gt; ₹2k
            </button>
          `
              : ''
          }
          </div>
        </div>

        <div class="settlement-arrow" aria-hidden="true">→</div>

        <div class="settlement-payee">
          <strong>${esc(st.creditorName)}</strong>
          <span class="quiet">${hasUpi ? esc(upiId) : 'No UPI configured'}</span>
        </div>

        <div class="settlement-amount amount">${formatCurrency(st.amountPaise)}</div>
      </div>
    `;
    })
    .join('');

  return `
    ${renderHeader(
      'Settle up',
      'A short list of direct transfers.',
      `
      <button class="button button-secondary" data-view="breakdown">← Back to Shares</button>
    `,
    )}

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
      <button class="button button-primary" data-action="share-claim-link">Share Bill for WhatsApp Self-Claim</button>
      <button class="button button-secondary" data-action="import-claim-modal">Import WhatsApp Claim</button>
      <button class="button button-secondary" data-action="save-current-bill">Save to Recent History</button>
    </div>

    <div class="panel" style="margin-top:24px;">
      <h2>Payment note</h2>
      <p class="panel-intro">
        UPI links and QR codes create payment intents. Confirm the transfer in your banking app.
      </p>
    </div>
  `;
}

export default function SettlementsView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="settlements"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
