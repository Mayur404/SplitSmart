/** SplitSmart — UPI QR, payment note and split-threshold dialogs. */
import { formatCurrency, netBalances, minimumCashFlow } from '../../algorithm.jsx';
import { paymentUri, renderQR, splitPayment, isValidUpiId } from '../../qr.jsx';
import { $, esc, toast } from '../core.jsx';
import { computeBillShares } from '../views/breakdown.jsx';

// QR Code Modal
export function openQRModal(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const creditor = calc.members.find(m => m.id === st.creditor);
  const upiId = creditor?.upiId;
  if (!isValidUpiId(upiId)) {
    toast('Creditor does not have a valid UPI ID.', true);
    return;
  }

  const uri = paymentUri({
    upiId,
    name: st.creditorName,
    amountPaise: st.amountPaise,
    note: `SplitSmart - ${calc.bill.restaurantName || 'Bill'}`
  });

  const container = $('#modal-qr-container');
  renderQR(container, uri, 220);

  $('#qr-dialog-title').textContent = `Pay ${st.creditorName}`;
  $('#qr-dialog-details').innerHTML = `
    <div style="font-size:20px;font-weight:700;margin-bottom:8px;">${formatCurrency(st.amountPaise)}</div>
    <div class="quiet" style="font-size:13px;">Payer: <strong>${esc(st.debtorName)}</strong></div>
    <div class="quiet" style="font-size:13px;">UPI ID: <strong>${esc(upiId)}</strong></div>
    <div class="quiet" style="font-size:12px;margin-top:10px;">Scan using Google Pay, PhonePe, Paytm, or BHIM.</div>
  `;

  $('#modal-upi-link').href = uri;
  $('#qr-dialog').showModal();
}

// Copy Payment Note
export function copyPaymentDetails(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const text = `${st.debtorName} owes ${st.creditorName} ${formatCurrency(st.amountPaise)} for ${calc.bill.restaurantName || 'outing'}.`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => toast('Payment details copied to clipboard.'))
      .catch(() => prompt('Copy payment details:', text));
  } else {
    prompt('Copy payment details:', text);
  }
}

// Large UPI Split Modal (> ₹2,000 threshold)
export function openSplitThresholdModal(settlementIdx) {
  const calc = computeBillShares();
  if (!calc) return;
  const balances = netBalances(calc.shares, calc.bill.payers || []);
  const settlements = minimumCashFlow(balances);
  const st = settlements[settlementIdx];
  if (!st) return;

  const totalPaise = st.amountPaise;
  const parts2 = splitPayment(totalPaise, 2);
  const parts3 = splitPayment(totalPaise, 3);

  const container = $('#split-dialog-options');
  container.innerHTML = `
    <div class="panel" style="background:var(--surface-alt);margin-bottom:12px;">
      <strong>Option A: 2 equal transfers</strong>
      <div class="quiet" style="font-size:13px;margin:6px 0;">
        Part 1: ${formatCurrency(parts2[0])} · Part 2: ${formatCurrency(parts2[1])}
      </div>
    </div>
    <div class="panel" style="background:var(--surface-alt);margin-bottom:12px;">
      <strong>Option B: 3 transfers</strong>
      <div class="quiet" style="font-size:13px;margin:6px 0;">
        Part 1: ${formatCurrency(parts3[0])} · Part 2: ${formatCurrency(parts3[1])} · Part 3: ${formatCurrency(parts3[2])}
      </div>
    </div>
    <p class="quiet" style="font-size:12px;">All splits sum exactly to ${formatCurrency(totalPaise)}. Bank limits depend on your account tier and UPI provider.</p>
  `;

  $('#split-dialog').showModal();
}
