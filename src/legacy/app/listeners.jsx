/** SplitSmart — Delegated change, input and keydown listeners. */
import { getRosters, saveRosters, saveSettings, importBackup } from '../state.jsx';
import { toPaise, formatCurrency } from '../algorithm.jsx';
import { $, S, toast } from './core.jsx';
import { renderAssign } from './views/assign.jsx';
import { updateBillTotalsLive } from './views/bill.jsx';
import { applyPayerAmounts, updateLivePayerSummary } from './views/breakdown.jsx';
import { renderGroups } from './views/groups.jsx';
import { executeNaturalLanguageCommand } from './commands.jsx';

// Change events: scan model, default payer, backup import, member search
document.addEventListener('change', e => {
  if (e.target.dataset.action === 'set-scan-model') {
    S.settings.selectedModel = e.target.value || 'auto';
    saveSettings(S.settings);
  }

  if (e.target.dataset.action === 'set-primary-payer') {
    const gid = e.target.dataset.group;
    const g = S.rosters.find(x => x.id === gid);
    if (g) {
      g.primaryPayerId = e.target.value || null;
      saveRosters(S.rosters);
      toast('Default payer updated for this group.');
    }
  }

  if (e.target.id === 'backup-file-input') {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        importBackup(parsed);
        S.rosters = getRosters();
        toast('Backup successfully restored!');
        renderGroups();
      } catch (err) {
        toast(err.message, true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  if (e.target.matches('[data-search-group]')) {
    const gid = e.target.dataset.searchGroup;
    const q = e.target.value.toLowerCase();
    const list = $(`[data-member-list="${CSS.escape(gid)}"]`);
    if (list) {
      list.querySelectorAll('.list-row').forEach(row => {
        const name = row.querySelector('.list-row-main div')?.textContent.toLowerCase() || '';
        row.style.display = name.includes(q) ? '' : 'none';
      });
    }
  }
});

// Dynamic Item Line Total Calculations on Bill Input
document.addEventListener('input', e => {
  if (e.target.closest('.item-entry')) {
    const row = e.target.closest('.item-entry');
    const qty = Number(row.querySelector('[data-field="quantity"]')?.value) || 0;
    const unitPrice = Number(row.querySelector('[data-field="unitPrice"]')?.value) || 0;
    const lineTotalPaise = Math.round(toPaise(unitPrice) * qty);
    const disp = row.querySelector('.item-total-display');
    if (disp) disp.textContent = formatCurrency(lineTotalPaise);

    // Update food subtotal live
    updateBillTotalsLive();
  }

  if (['tax-gst', 'tax-cgst', 'tax-sgst', 'tax-sc', 'rate-gst', 'rate-cgst', 'rate-sgst', 'rate-sc', 'bill-discount', 'bill-fixed-fee', 'stated-total', 'tax-basis-select'].includes(e.target.id)) {
    updateBillTotalsLive();
  }

  if (e.target.matches('.payer-amount-input')) {
    updateLivePayerSummary();
  }

  if (e.target.id === 'assign-member-search') {
    S.assignmentSearchQuery = e.target.value;
    renderAssign();
  }
});

// Pressing Enter in command input or payer amount input
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'command-input') {
    e.preventDefault();
    const val = e.target.value;
    if (val && val.trim()) {
      executeNaturalLanguageCommand(val);
      e.target.value = '';
    }
  }

  if (e.key === 'Enter' && e.target.matches('.payer-amount-input')) {
    e.preventDefault();
    applyPayerAmounts(true);
  }
});

// Synchronize model availability collapsed/expanded state
document.addEventListener('toggle', e => {
  if (e.target && e.target.id === 'sc-models-box' && typeof window !== 'undefined') {
    window.__scModelsOpen = e.target.open;
  }
}, true);
