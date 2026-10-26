/* eslint-disable react-refresh/only-export-components */
/**
 * ClaimView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildClaimMarkup(ctx) {
  const { decodeShare, esc, formatCurrency } = ctx;

  try {
    ctx.decodedClaimPayload = decodeShare(window.location.hash);
  } catch (err) {
    return `
      <div class="panel" style="max-width:540px;margin:40px auto;text-align:center;">
        <div style="font-size:36px;margin-bottom:12px;">⚠️</div>
        <h2>Invalid or Expired Link</h2>
        <p style="margin-bottom:20px;">${esc(err.message)}</p>
        <a class="button button-primary" href="${esc(window.location.pathname)}">Open SplitSmart Home</a>
      </div>
    `;
  }

  const p = ctx.decodedClaimPayload;

  const itemsHtml = p.items
    .map(
      (it) => `
    <label class="list-row" style="cursor:pointer;padding:12px 6px;">
      <input type="checkbox" data-claim-item="${esc(it.id)}" style="width:auto;margin-right:12px;">
      <div class="list-row-main">
        <div style="font-weight:600;font-size:14.5px;">${esc(it.name)}</div>
        <div class="quiet" style="font-size:12px;">Qty ${it.quantity}</div>
      </div>
      <span class="amount">${formatCurrency(it.costPaise)}</span>
    </label>
  `,
    )
    .join('');

  return `
    <div style="max-width:620px;margin:0 auto;">
      <div class="panel" style="background:var(--accent);color:white;border:none;">
        <h1 style="color:white;font-size:22px;margin-bottom:4px;">${esc(p.outing)}</h1>
        <p style="color:var(--accent-soft);font-size:13.5px;">Select the items you consumed. This creates a WhatsApp claim message to send to the host.</p>
      </div>

      <div class="panel">
        <label style="margin-bottom:18px;">
          Select Your Name
          <select id="claimant-name-select" data-validate="claimant" required style="font-size:15px;padding:10px;">
            <option value="">-- Choose your name --</option>
            ${p.participants.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('')}
          </select>
        </label>

        <h3 style="font-size:16px;margin-bottom:10px;">Which items did you share?</h3>
        <div class="list" id="claim-items-list" style="margin-bottom:18px;">
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

export default function ClaimView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="claim"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
