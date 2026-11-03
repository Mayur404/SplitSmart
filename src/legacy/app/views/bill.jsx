/** SplitSmart — Bill creation view. */
import { uid } from '../../state.jsx';
import { toPaise, formatCurrency, getCombinedTaxRate } from '../../algorithm.jsx';
import { GEMINI_CONFIGURED } from '../../../config/gemini.jsx';
import { renderModelAvailabilityHTML } from '../../quota.jsx';
import { $$, $, S, currentBill, esc, icon, members } from '../core.jsx';
import { initOuting } from '../outing.jsx';
import { renderHeader, renderWorkflow } from './chrome.jsx';

export function renderBill() {
  const bill = currentBill();
  if (!bill) {
    initOuting(S.activeGroup);
    return;
  }

  const items = bill.items || [];
  const foodSubtotalPaise = items.reduce((acc, it) => acc + (toPaise(it.unitPaise / 100) * (Number(it.quantity) || 1)), 0);

  const rates = getCombinedTaxRate({
    ...(bill.tax || {}),
    ...(bill.taxRates || {})
  });

  const cgstPaise = toPaise(bill.tax?.cgst);
  const sgstPaise = toPaise(bill.tax?.sgst);
  const gstPaise = toPaise(bill.tax?.gst);
  const scPaise = toPaise(bill.tax?.serviceCharge);
  const discountPaise = toPaise(bill.discount);
  const fixedFeePaise = toPaise(bill.fixedFee);

  let gstRate = rates.gstRate;
  let cgstRate = rates.cgstRate;
  let sgstRate = rates.sgstRate;
  let scRate = rates.serviceChargeRate;

  // Derive rates from paise if rates were not set on bill
  if (rates.combinedRate === 0 && foodSubtotalPaise > 0) {
    if (cgstPaise > 0 || sgstPaise > 0) {
      cgstRate = Math.round((cgstPaise / foodSubtotalPaise) * 1000) / 10;
      sgstRate = Math.round((sgstPaise / foodSubtotalPaise) * 1000) / 10;
      gstRate = cgstRate + sgstRate;
    } else if (gstPaise > 0) {
      gstRate = Math.round((gstPaise / foodSubtotalPaise) * 1000) / 10;
    }
    if (scPaise > 0) {
      scRate = Math.round((scPaise / foodSubtotalPaise) * 1000) / 10;
    }
  }

  const isCombinedGst = bill.tax?.isCombined ?? (gstRate > 0 && cgstRate === 0 && sgstRate === 0);
  const combinedRate = gstRate + scRate;

  const additionalChargesPaise = Math.round((foodSubtotalPaise * combinedRate) / 100);
  const calculatedGrandTotalPaise = Math.max(0, foodSubtotalPaise + additionalChargesPaise + fixedFeePaise - discountPaise);
  const statedPaise = bill.statedTotal != null && bill.statedTotal !== '' ? toPaise(bill.statedTotal) : null;
  const discrepancyPaise = statedPaise != null ? (statedPaise - calculatedGrandTotalPaise) : 0;
  const hasDiscrepancy = statedPaise != null && Math.abs(discrepancyPaise) > 5;

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
    <div class="bill-page">
    ${renderHeader('New bill', 'Add the receipt details, then assign each item.', `
      <button class="button button-secondary" data-view="groups">Change Group (${esc(S.activeGroup?.name || 'Group')})</button>
    `)}
    ${renderWorkflow('bill')}

    <div class="columns">
      <section>
        <div class="panel">
          <h2>Bill details</h2>
          <div class="field-grid">
            <label>
              Name
              <input id="bill-restaurant" value="${esc(bill.restaurantName)}" placeholder="e.g. Social, Koramangala">
            </label>
            <label>
              Date
              <input id="bill-date" type="date" value="${esc(bill.date)}">
            </label>
            <label class="full">
              Note <span class="quiet">(optional)</span>
              <input id="bill-notes" value="${esc(bill.notes)}" placeholder="e.g. Friday team dinner">
            </label>
          </div>
        </div>

        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Items</h2>
                <p>Items from the receipt.</p>
            </div>
            <span class="pill">${items.length} item${items.length === 1 ? '' : 's'}</span>
          </div>

          <div id="items-container">
            ${itemRowsHtml}
          </div>

          <div class="button-row" style="margin-top:14px;">
            <button class="button button-secondary button-small" data-action="add-item-row">${icon('plus')} Add item</button>
          </div>

          <hr class="divider">

          <div class="total-line">
            <span>Food Subtotal</span>
            <strong class="amount" id="food-subtotal-display">${formatCurrency(foodSubtotalPaise)}</strong>
          </div>
        </div>

        <div class="panel">
          <h2>Adjustments</h2>
          <p class="panel-intro">Taxes and service charges are calculated as combined percentages on food subtotal.</p>

          <div class="field-grid three">
            ${isCombinedGst ? `
              <label>
                GST (%)
                <input id="rate-gst" type="number" min="0" step="0.1" value="${gstRate || ''}" placeholder="5">
              </label>
            ` : `
              <label>
                CGST (%)
                <input id="rate-cgst" type="number" min="0" step="0.1" value="${cgstRate || ''}" placeholder="2.5">
              </label>
              <label>
                SGST (%)
                <input id="rate-sgst" type="number" min="0" step="0.1" value="${sgstRate || ''}" placeholder="2.5">
              </label>
            `}
            <label>
              Service Charge (%)
              <input id="rate-sc" type="number" min="0" step="0.1" value="${scRate || ''}" placeholder="10">
            </label>
            <div class="total-line" style="display:flex; flex-direction:column; justify-content:center; padding: 6px 0;">
              <span class="quiet" style="font-size:12px;">Combined Rate</span>
              <strong id="combined-rate-display" style="font-size:18px; color:var(--accent, #a3e635);">${combinedRate}%</strong>
            </div>
          </div>

          <div style="margin-top:-6px; margin-bottom:12px;">
            <button type="button" class="btn-text quiet" data-action="toggle-gst-mode" style="background:none; border:none; padding:0; cursor:pointer; font-size:12px; text-decoration:underline; color:var(--accent, #a3e635);">
              ${isCombinedGst ? 'Enter separate CGST + SGST instead' : 'Enter single combined GST instead'}
            </button>
          </div>

          <div class="total-line" style="margin-top:6px; margin-bottom:14px; background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:8px;">
            <span>Additional Charges (<span id="additional-rate-label">${combinedRate}%</span>)</span>
            <strong class="amount" id="additional-charges-display">${formatCurrency(additionalChargesPaise)}</strong>
          </div>

          ${(bill.discount || bill.fixedFee || bill.fixedAmounts) ? `
            <div style="margin-top:14px; margin-bottom:12px;">
              <h3 style="font-size:13px; text-transform:uppercase; letter-spacing:0.05em; color:var(--muted); margin-bottom:8px;">Fixed Adjustments</h3>
              <div class="field-grid two">
                <label>
                  Fixed Discount (₹)
                  <input id="bill-discount" type="number" min="0" step="0.01" value="${bill.discount || ''}" placeholder="0.00">
                </label>
                <label>
                  Fixed Fee / Extra (₹)
                  <input id="bill-fixed-fee" type="number" min="0" step="0.01" value="${bill.fixedFee || ''}" placeholder="0.00">
                </label>
              </div>
            </div>
          ` : `
            <div style="margin-bottom:12px;">
              <label class="quiet" style="font-size:12px; display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
                <input type="checkbox" id="toggle-fixed-adjustments" onchange="$('#fixed-adj-section').hidden = !this.checked">
                Add fixed discount or delivery fee
              </label>
              <div id="fixed-adj-section" class="field-grid two" hidden style="margin-top:8px;">
                <label>
                  Fixed Discount (₹)
                  <input id="bill-discount" type="number" min="0" step="0.01" value="${bill.discount || ''}" placeholder="0.00">
                </label>
                <label>
                  Fixed Fee / Extra (₹)
                  <input id="bill-fixed-fee" type="number" min="0" step="0.01" value="${bill.fixedFee || ''}" placeholder="0.00">
                </label>
              </div>
            </div>
          `}

          <div class="field-grid" style="margin-bottom:12px;">
            <label class="full">
              Receipt Stated Grand Total (₹) <span class="quiet">(Optional verification)</span>
              <input id="stated-total" type="number" min="0" step="0.01" value="${bill.statedTotal ?? ''}" placeholder="${(calculatedGrandTotalPaise / 100).toFixed(2)}">
            </label>
          </div>

          ${hasDiscrepancy ? `
            <div class="warning" style="margin-bottom:14px;">
              ${icon('warning')} <strong>Receipt discrepancy:</strong> Printed total is <strong>${formatCurrency(statedPaise)}</strong>, but calculated total is <strong>${formatCurrency(calculatedGrandTotalPaise)}</strong> (Difference: ${formatCurrency(Math.abs(discrepancyPaise))}).
              <p class="quiet" style="margin-top:6px; font-size:12px; line-height:1.4;">
                The difference is due to the restaurant calculating GST on top of service charge. SplitSmart allocates charges without compounding.
              </p>
              <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
                <button class="button button-small button-primary" data-action="sync-calculated-total">Use Calculated Total (${formatCurrency(calculatedGrandTotalPaise)})</button>
                <button class="button button-small button-secondary" data-action="add-fixed-difference" data-diff="${(Math.abs(discrepancyPaise) / 100).toFixed(2)}">Add ${formatCurrency(Math.abs(discrepancyPaise))} as Fixed Adjustment</button>
              </div>
            </div>
          ` : ''}

          <div class="total-line grand">
            <span>Grand Total</span>
            <strong class="amount" id="grand-total-display">${formatCurrency(calculatedGrandTotalPaise)}</strong>
          </div>
        </div>

        <div class="button-row">
          <button class="button button-primary" data-action="go-to-assign">Assign items ${icon('arrowRight')}</button>
          <button class="button button-secondary" data-action="save-draft">Save Draft</button>
        </div>
      </section>

      <aside>
        <section class="panel scanner" id="receipt-scanner" data-state="${S.scanNotice ? 'done' : 'idle'}" data-configured="${GEMINI_CONFIGURED}">
          <header class="sc-head">
            <span class="sc-badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10"/></svg></span>
            <div>
              <h2>Receipt scanner</h2>
             <p class="sc-lead">Upload a receipt and SplitSmart will extract the items. Images are compressed in your browser.</p>
            </div>
          </header>

          ${GEMINI_CONFIGURED ? '' : `<div class="sc-note is-warn" role="note">${icon('warning')} You can select and preview a receipt, but AI scanning needs <strong>VITE_GEMINI_API_KEY</strong> in your local <code>.env</code> file.</div>`}

          <label class="sc-drop" id="sc-drop" for="receipt-upload">
            <span class="sc-drop-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg></span>
            <span class="sc-drop-title">Drop a receipt here</span>
            <span class="sc-drop-sub">or <span class="sc-link">browse files</span></span>
            <span class="sc-drop-meta">JPG, PNG, WEBP or HEIC · up to 15 MB</span>
            <input type="file" id="receipt-upload" class="sc-input" accept="image/*,.heic,.heif" capture="environment">
          </label>

          <div class="sc-file" id="sc-file" hidden>
            <img id="sc-thumb" alt="Selected receipt preview" width="52" height="52" hidden>
            <div class="sc-file-meta"><strong id="sc-name"></strong><span id="sc-size"></span></div>
            <div class="sc-file-actions">
              <button type="button" class="button button-quiet button-small" data-sc="replace">Replace</button>
              <button type="button" class="button button-quiet button-small" data-sc="remove">Remove</button>
            </div>
          </div>

           <button class="button button-primary sc-scan" id="scan-btn" data-action="scan-receipt" ${GEMINI_CONFIGURED ? '' : 'disabled'}>
            <span id="scan-spinner" class="sc-spinner" aria-hidden="true"></span><span id="scan-label">${S.scanNotice ? 'Scan another receipt' : 'Scan receipt'}</span>
          </button>
          <div class="sc-progress" aria-hidden="true"><i></i></div>
           <div id="scan-status" class="sc-status" role="status" aria-live="polite">${S.scanNotice ? `<div class="sc-note is-ok">${icon('check')} <span><strong>${S.scanNotice.count} item${S.scanNotice.count === 1 ? '' : 's'} found${S.scanNotice.modelLabel ? ` · ${esc(S.scanNotice.modelLabel)}` : ''}.</strong> Review and edit them in the list.</span></div>` : ''}</div>
          ${GEMINI_CONFIGURED ? renderModelAvailabilityHTML() : ''}
        </section>

        <div class="panel">
          <h2>Group</h2>
          <p class="panel-intro">${esc(S.activeGroup?.name || 'Group')}</p>
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
            <button class="button button-secondary button-small" data-view="groups">Manage group</button>
          </div>
        </div>
      </aside>
    </div>
    </div>
  `;
}

export function syncBillFromDom() {
  const bill = currentBill();
  if (!bill) return;

  const restInput = $('#bill-restaurant');
  const dateInput = $('#bill-date');
  const notesInput = $('#bill-notes');
  const gstRateInput = $('#rate-gst');
  const cgstRateInput = $('#rate-cgst');
  const sgstRateInput = $('#rate-sgst');
  const scRateInput = $('#rate-sc');
  const discInput = $('#bill-discount');
  const feeInput = $('#bill-fixed-fee');
  const statedInput = $('#stated-total');

  if (restInput) bill.restaurantName = restInput.value.trim();
  if (dateInput) bill.date = dateInput.value;
  if (notesInput) bill.notes = notesInput.value.trim();

  let cgstRate = 0;
  let sgstRate = 0;
  let gstRate = 0;

  if (gstRateInput) {
    gstRate = Number(gstRateInput.value) || 0;
    bill.tax.isCombined = true;
  } else {
    cgstRate = Number(cgstRateInput?.value) || 0;
    sgstRate = Number(sgstRateInput?.value) || 0;
    gstRate = cgstRate + sgstRate;
    bill.tax.isCombined = false;
  }

  const scRate = Number(scRateInput?.value) || 0;
  const combinedRate = gstRate + scRate;

  bill.taxRates = {
    gstRate,
    cgstRate,
    sgstRate,
    serviceChargeRate: scRate,
    combinedRate
  };

  bill.tax = {
    ...(bill.tax || {}),
    isCombined: bill.tax.isCombined,
    gstRate,
    cgstRate,
    sgstRate,
    serviceChargeRate: scRate,
    combinedRate
  };

  if (discInput) bill.discount = Number(discInput.value) || 0;
  if (feeInput) bill.fixedFee = Number(feeInput.value) || 0;
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

export function updateBillTotalsLive() {
  const rows = $$('.item-entry');
  let foodPaise = 0;
  rows.forEach(r => {
    const q = Number(r.querySelector('[data-field="quantity"]')?.value) || 0;
    const u = Number(r.querySelector('[data-field="unitPrice"]')?.value) || 0;
    foodPaise += Math.round(toPaise(u) * q);
  });

  const gstRateInput = $('#rate-gst');
  const cgstRateInput = $('#rate-cgst');
  const sgstRateInput = $('#rate-sgst');
  const scRateInput = $('#rate-sc');
  const discInput = $('#bill-discount');
  const feeInput = $('#bill-fixed-fee');

  let gstRate = 0;
  if (gstRateInput) {
    gstRate = Number(gstRateInput.value) || 0;
  } else {
    gstRate = (Number(cgstRateInput?.value) || 0) + (Number(sgstRateInput?.value) || 0);
  }
  const scRate = Number(scRateInput?.value) || 0;
  const combinedRate = gstRate + scRate;

  const additionalChargesPaise = Math.round((foodPaise * combinedRate) / 100);
  const discPaise = toPaise(discInput?.value);
  const feePaise = toPaise(feeInput?.value);
  const grandPaise = Math.max(0, foodPaise + additionalChargesPaise + feePaise - discPaise);

  const foodEl = $('#food-subtotal-display');
  const addChargesEl = $('#additional-charges-display');
  const addRateLabel = $('#additional-rate-label');
  const combinedEl = $('#combined-rate-display');
  const grandEl = $('#grand-total-display');

  if (foodEl) foodEl.textContent = formatCurrency(foodPaise);
  if (addChargesEl) addChargesEl.textContent = formatCurrency(additionalChargesPaise);
  if (addRateLabel) addRateLabel.textContent = `${combinedRate}%`;
  if (combinedEl) combinedEl.textContent = `${combinedRate}%`;
  if (grandEl) grandEl.textContent = formatCurrency(grandPaise);
}
