/** Bill form synchronization, validation, share calculation, and payer-entry behavior. */
export function createBillingController(deps) {
  const { $, $$, currentBill, members, toPaise, uid, validateFields, toast, calculateShares, formatCurrency, renderBreakdown } = deps;

  function syncBillFromDom() {
    const bill = currentBill();
    if (!bill) return;

    const restInput = $('#bill-restaurant');
    const dateInput = $('#bill-date');
    const notesInput = $('#bill-notes');
    const cgstInput = $('#tax-cgst');
    const sgstInput = $('#tax-sgst');
    const scInput = $('#tax-sc');
    const discInput = $('#bill-discount');
    const statedInput = $('#stated-total');

    if (restInput) bill.restaurantName = restInput.value.trim();
    if (dateInput) bill.date = dateInput.value;
    if (notesInput) bill.notes = notesInput.value.trim();
    if (cgstInput) bill.tax.cgst = Number(cgstInput.value) || 0;
    if (sgstInput) bill.tax.sgst = Number(sgstInput.value) || 0;
    if (scInput) bill.tax.serviceCharge = Number(scInput.value) || 0;
    if (discInput) bill.discount = Number(discInput.value) || 0;
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
          assignments: existing.assignments || [],
        };
      });
    }
  }

  function validateBillEntry() {
    const root = $('#legacy-react-root');
    const valid = validateFields(root);
    if (!valid) {
      toast('Please correct the highlighted bill fields before continuing.', true);
      return false;
    }

    syncBillFromDom();
    const bill = currentBill();
    if (!bill || !bill.items.length) {
      toast('Please add at least one bill item.', true);
      return false;
    }

    return true;
  }

  function computeBillShares() {
    const bill = currentBill();
    if (!bill) return null;

    const groupMembers = members();
    const tax = {
      cgst: toPaise(bill.tax.cgst),
      sgst: toPaise(bill.tax.sgst),
      serviceCharge: toPaise(bill.tax.serviceCharge),
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
      shares,
    };
  }

  function updateLivePayerSummary() {
    const inputs = $$('.payer-amount-input');
    const calc = computeBillShares();
    if (!calc || !inputs.length) return;

    let totalPaise = 0;
    inputs.forEach((inp) => {
      totalPaise += toPaise(inp.value);
    });

    const diffPaise = calc.grandTotal - totalPaise;
    const balanced = diffPaise === 0;

    const totEl = $('#payer-total-display');
    if (totEl) totEl.textContent = formatCurrency(totalPaise);

    const msgEl = $('#payer-status-msg');
    if (msgEl) {
      if (balanced) {
        msgEl.innerHTML = `
          <div class="success" style="font-size:12.5px;padding:8px 12px;margin-top:8px;">
            ✓ Total paid matches bill total (${formatCurrency(calc.grandTotal)}). Click "Update Calculations" to apply.
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

  function applyPayerAmounts(showToast = true) {
    const bill = currentBill();
    const calc = computeBillShares();
    if (!bill || !calc) return false;

    const payerPanel = $('#payers-panel');
    if (!validateFields(payerPanel)) {
      if (showToast) toast('Please correct the highlighted payment amounts.', true);
      return false;
    }

    const inputs = $$('.payer-amount-input');
    if (!inputs.length) return false;

    const newPayers = [];
    let totalPaid = 0;

    inputs.forEach((input) => {
      const memberId = input.dataset.memberId;
      const amountPaise = toPaise(input.value);
      if (amountPaise > 0) {
        newPayers.push({ memberId, amountPaise });
        totalPaid += amountPaise;
      }
    });

    const difference = calc.grandTotal - totalPaid;
    if (difference !== 0) {
      if (showToast) {
        toast(
          `Payments recorded (${formatCurrency(totalPaid)}) must equal the bill total (${formatCurrency(calc.grandTotal)}). Difference: ${formatCurrency(Math.abs(difference))}.`,
          true,
        );
      }
      updateLivePayerSummary();
      return false;
    }

    bill.payers = newPayers;
    if (showToast) toast('Payments updated and calculations balanced!');
    renderBreakdown();
    return true;
  }

  function updateBillTotalsLive() {
    const rows = $$('.item-entry');
    let foodPaise = 0;
    rows.forEach((r) => {
      const q = Number(r.querySelector('[data-field="quantity"]')?.value) || 0;
      const u = Number(r.querySelector('[data-field="unitPrice"]')?.value) || 0;
      foodPaise += Math.round(toPaise(u) * q);
    });

    const cgst = toPaise($('#tax-cgst')?.value);
    const sgst = toPaise($('#tax-sgst')?.value);
    const sc = toPaise($('#tax-sc')?.value);
    const disc = toPaise($('#bill-discount')?.value);
    const grandPaise = Math.max(0, foodPaise + cgst + sgst + sc - disc);

    const foodEl = $('#food-subtotal-display');
    const grandEl = $('#grand-total-display');
    if (foodEl) foodEl.textContent = formatCurrency(foodPaise);
    if (grandEl) grandEl.textContent = formatCurrency(grandPaise);
  }

  return { syncBillFromDom, validateBillEntry, computeBillShares, updateLivePayerSummary, applyPayerAmounts, updateBillTotalsLive };
}
