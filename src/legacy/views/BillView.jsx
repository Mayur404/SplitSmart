/* eslint-disable react-refresh/only-export-components */
/**
 * BillView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildBillMarkup(ctx) {
  const {
    currentBill,
    initOuting,
    activeGroup,
    toPaise,
    esc,
    formatCurrency,
    renderHeader,
    members,
  } = ctx;

  const bill = currentBill();
  if (!bill) {
    initOuting(activeGroup);
    return;
  }

  const items = bill.items || [];
  const foodSubtotalPaise = items.reduce(
    (acc, it) => acc + toPaise(it.unitPaise / 100) * (Number(it.quantity) || 1),
    0,
  );

  const cgstPaise = toPaise(bill.tax.cgst);
  const sgstPaise = toPaise(bill.tax.sgst);
  const scPaise = toPaise(bill.tax.serviceCharge);
  const discountPaise = toPaise(bill.discount);

  const calculatedGrandTotalPaise = Math.max(
    0,
    foodSubtotalPaise + cgstPaise + sgstPaise + scPaise - discountPaise,
  );
  const statedPaise =
    bill.statedTotal != null && bill.statedTotal !== '' ? toPaise(bill.statedTotal) : null;
  const hasDiscrepancy = statedPaise != null && statedPaise !== calculatedGrandTotalPaise;

  const itemRowsHtml = items
    .map((it, idx) => {
      const qty = Number(it.quantity) || 1;
      const unitRupees = (Number(it.unitPaise) / 100).toFixed(2);
      const lineTotalPaise = Math.round(it.unitPaise * qty);

      return `
      <div class="item-entry" data-item-idx="${idx}">
        <label>
          Item Name
          <input type="text" data-field="name" data-validate="item-name" value="${esc(it.name)}" placeholder="e.g. Paneer Butter Masala" required minlength="2" maxlength="100" autocomplete="off">
        </label>
        <label>
          Qty
          <input type="number" data-field="quantity" data-validate="positive-quantity" value="${qty}" min="0.01" max="9999" step="any" required>
        </label>
        <label>
          Unit Price (₹)
          <input type="number" data-field="unitPrice" data-validate="money" value="${unitRupees}" min="0" max="99999999.99" step="0.01" required>
        </label>
        <div class="item-entry-total">
          Line Total
          <div class="item-total-display">${formatCurrency(lineTotalPaise)}</div>
        </div>
        <label>
          Diet Tag
          <select data-field="category" data-validate="category">
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
    })
    .join('');

  return `
    ${renderHeader(
      'Enter Bill Details',
      'Add items manually or scan a paper receipt. You can finish without AI.',
      `
      <button class="button button-secondary" data-view="groups">Change Group (${esc(activeGroup?.name || 'Group')})</button>
    `,
    )}

    <div class="columns">
      <section>
        <div class="panel">
          <h2>Bill Information</h2>
          <div class="field-grid">
            <label>
              Restaurant / Outing Name
              <input id="bill-restaurant" data-validate="outing-name" value="${esc(bill.restaurantName)}" placeholder="e.g. Social, Koramangala" maxlength="100">
            </label>
            <label>
              Date
              <input id="bill-date" data-validate="required-date" type="date" value="${esc(bill.date)}" required>
            </label>
            <label class="full">
              Notes <span class="quiet">(Optional)</span>
              <input id="bill-notes" data-validate="optional-text" value="${esc(bill.notes)}" placeholder="e.g. Friday team dinner" maxlength="300">
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
              <input id="tax-cgst" data-validate="money" type="number" min="0" max="99999999.99" step="0.01" value="${bill.tax.cgst || ''}" placeholder="0.00">
            </label>
            <label>
              SGST (₹)
              <input id="tax-sgst" data-validate="money" type="number" min="0" max="99999999.99" step="0.01" value="${bill.tax.sgst || ''}" placeholder="0.00">
            </label>
            <label>
              Service Charge (₹)
              <input id="tax-sc" data-validate="money" type="number" min="0" max="99999999.99" step="0.01" value="${bill.tax.serviceCharge || ''}" placeholder="0.00">
            </label>
            <label>
              Discount (₹)
              <input id="bill-discount" data-validate="discount" type="number" min="0" max="99999999.99" step="0.01" value="${bill.discount || ''}" placeholder="0.00">
            </label>
            <label class="full">
              Receipt Stated Grand Total (₹) <span class="quiet">(Optional verification)</span>
              <input id="stated-total" data-validate="money" type="number" min="0" max="99999999.99" step="0.01" value="${bill.statedTotal ?? ''}" placeholder="${(calculatedGrandTotalPaise / 100).toFixed(2)}">
            </label>
          </div>

          ${
            hasDiscrepancy
              ? `
            <div class="warning">
              ⚠️ <strong>Receipt Discrepancy:</strong> Stated total is <strong>${formatCurrency(statedPaise)}</strong>, but calculated total is <strong>${formatCurrency(calculatedGrandTotalPaise)}</strong> (Difference: ${formatCurrency(statedPaise - calculatedGrandTotalPaise)}).
              <div style="margin-top:8px;">
                <button class="button button-small button-secondary" data-action="sync-calculated-total">Use Calculated Total (${formatCurrency(calculatedGrandTotalPaise)})</button>
              </div>
            </div>
          `
              : ''
          }

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
            <input type="file" id="receipt-upload" data-file-validation="image" accept="image/*" capture="environment" style="font-size:12px;">
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
          ${
            members().length > 0
              ? `
            <div class="member-chips">
              ${members()
                .map(
                  (m) => `
                <span class="chip" style="cursor:default;">
                  ${esc(m.name)}
                  <small class="quiet">${esc(m.dietaryTag)}</small>
                </span>
              `,
                )
                .join('')}
            </div>
          `
              : `
            <div class="warning">This group has no members! Add members in the Groups tab to proceed.</div>
          `
          }
          <div style="margin-top:14px;">
            <button class="button button-secondary button-small" data-view="groups">Manage Group Members</button>
          </div>
        </div>
      </aside>
    </div>
  `;
}

export default function BillView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="bill"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
