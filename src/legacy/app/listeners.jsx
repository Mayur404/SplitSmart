import { getRosters, saveRosters, saveSettings, importBackup } from '../state.jsx';
import { toPaise, formatCurrency } from '../algorithm.jsx';
import { $, S, toast } from './core.jsx';
import { renderAssign } from './views/assign.jsx';
import { updateBillTotalsLive } from './views/bill.jsx';
import { applyPayerAmounts, updateLivePayerSummary } from './views/breakdown.jsx';
import { renderGroups } from './views/groups.jsx';

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


document.addEventListener('input', e => {
  if (e.target.closest('.item-entry')) {
    const row = e.target.closest('.item-entry');
    const qty = Number(row.querySelector('[data-field="quantity"]')?.value) || 0;
    const unitPrice = Number(row.querySelector('[data-field="unitPrice"]')?.value) || 0;
    const lineTotalPaise = Math.round(toPaise(unitPrice) * qty);
    const disp = row.querySelector('.item-total-display');
    if (disp) disp.textContent = formatCurrency(lineTotalPaise);

    updateBillTotalsLive();
  }

  if (['tax-cgst', 'tax-sgst', 'tax-sc', 'bill-discount', 'stated-total'].includes(e.target.id)) {
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

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.payer-amount-input')) {
    e.preventDefault();
    applyPayerAmounts(true);
  }
});
