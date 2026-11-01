/** SplitSmart — Click action handlers: settlement. */
import { toPaise, formatCurrency } from '../../algorithm.jsx';
import { $$, $, currentBill, members, toast } from '../core.jsx';
import { copyPaymentDetails, openQRModal, openSplitThresholdModal } from '../modals/payment.jsx';
import { saveCurrentOutingToRecent } from '../outing.jsx';
import { go } from '../router.jsx';
import { applyPayerAmounts, computeBillShares, renderBreakdown } from '../views/breakdown.jsx';

export const ACTIONS = [
  'set-first-payer',
  'split-payers-equally',
  'apply-payers',
  'fill-remaining-payer',
  'quick-split-unassigned',
  'finalize-settlement',
  'open-qr',
  'close-qr',
  'copy-payment-note',
  'split-threshold',
  'close-split'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'set-first-payer': {
      const b = currentBill();
      const calc = computeBillShares();
      if (b && calc && members().length) {
        const first = members()[0];
        b.payers = [{ memberId: first.id, amountPaise: calc.grandTotal }];
        renderBreakdown();
        toast(`${first.name} set as full payer.`);
      }
      break;
    }

    case 'split-payers-equally': {
      const b = currentBill();
      const calc = computeBillShares();
      if (b && calc && members().length) {
        const gMembers = members();
        const n = gMembers.length;
        const base = Math.floor(calc.grandTotal / n);
        const rem = calc.grandTotal % n;
        b.payers = gMembers.map((m, i) => ({
          memberId: m.id,
          amountPaise: base + (i < rem ? 1 : 0)
        }));
        renderBreakdown();
        toast('Bill payments divided equally across all members.');
      }
      break;
    }

    case 'apply-payers': {
      applyPayerAmounts(true);
      break;
    }

    case 'fill-remaining-payer': {
      const mid = actionBtn.dataset.memberId;
      const calc = computeBillShares();
      if (!calc) return;

      const inputs = $$('.payer-amount-input');
      let otherSum = 0;
      inputs.forEach(inp => {
        if (inp.dataset.memberId !== mid) {
          otherSum += toPaise(inp.value);
        }
      });

      const remainder = Math.max(0, calc.grandTotal - otherSum);
      const targetInp = $(`.payer-amount-input[data-member-id="${mid}"]`);
      if (targetInp) {
        targetInp.value = (remainder / 100).toFixed(2);
      }

      applyPayerAmounts(true);
      break;
    }

    case 'quick-split-unassigned': {
      const b = currentBill();
      if (!b) return;
      const allIds = members().map(m => m.id);
      let count = 0;
      b.items.forEach(item => {
        if (!item.assignments || item.assignments.length === 0) {
          item.assignments = [...allIds];
          count++;
        }
      });
      renderBreakdown();
      toast(`Assigned ${count} unassigned item(s) equally across all group members.`);
      break;
    }

    case 'finalize-settlement': {
      const b = currentBill();
      const calc = computeBillShares();
      if (!b || !calc) return;

      // 1. Commit any currently typed payer amounts in input fields
      applyPayerAmounts(false);

      // 2. Re-compute after committing inputs
      const updatedCalc = computeBillShares();
      const updatedBill = updatedCalc.bill;
      const unassigned = updatedCalc.items.filter(i => !i.assignments || i.assignments.length === 0);

      if (unassigned.length > 0) {
        toast(`Cannot generate settlement plan: ${unassigned.length} item(s) are unassigned. Please assign or split them first.`, true);
        const banner = $('#unassigned-banner');
        if (banner) {
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
          banner.style.boxShadow = '0 0 0 3px #f59e0b';
          setTimeout(() => { if (banner) banner.style.boxShadow = ''; }, 2500);
        }
        return;
      }

      const totalPaidPaise = (updatedBill.payers || []).reduce((acc, p) => acc + (p.amountPaise || 0), 0);
      const diff = updatedCalc.grandTotal - totalPaidPaise;
      if (diff !== 0) {
        toast(`Recorded payments (${formatCurrency(totalPaidPaise)}) must equal the bill grand total (${formatCurrency(updatedCalc.grandTotal)}). Difference: ${formatCurrency(Math.abs(diff))}.`, true);
        const aside = $('#payers-panel');
        if (aside) {
          aside.scrollIntoView({ behavior: 'smooth', block: 'center' });
          aside.style.boxShadow = '0 0 0 3px #ef4444';
          setTimeout(() => { if (aside) aside.style.boxShadow = ''; }, 2500);
        }
        return;
      }

      saveCurrentOutingToRecent();
      go('settlements');
      toast('Settlement plan generated successfully.');
      break;
    }

    case 'open-qr': {
      const idx = Number(actionBtn.dataset.idx);
      openQRModal(idx);
      break;
    }

    case 'close-qr': {
      $('#qr-dialog').close();
      break;
    }

    case 'copy-payment-note': {
      const idx = Number(actionBtn.dataset.idx);
      copyPaymentDetails(idx);
      break;
    }

    case 'split-threshold': {
      const idx = Number(actionBtn.dataset.idx);
      openSplitThresholdModal(idx);
      break;
    }

    case 'close-split': {
      $('#split-dialog').close();
      break;
    }
  }
}
