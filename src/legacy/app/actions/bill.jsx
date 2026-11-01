import { uid } from '../../state.jsx';
import { handleReceiptScan } from '../commands.jsx';
import { S, currentBill, members, persistActiveOuting, toast } from '../core.jsx';
import { go } from '../router.jsx';
import { renderBill, syncBillFromDom } from '../views/bill.jsx';

export const ACTIONS = [
  'add-item-row',
  'remove-item',
  'sync-calculated-total',
  'go-to-assign',
  'back-to-bill',
  'scan-receipt',
  'reopen-bill'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'add-item-row': {
      syncBillFromDom();
      const b = currentBill();
      if (b) {
        b.items.push({ id: uid('item'), name: '', quantity: 1, unitPaise: 0, totalPaise: 0, category: 'ANY', assignments: [] });
        renderBill();
      }
      break;
    }

    case 'remove-item': {
      syncBillFromDom();
      const b = currentBill();
      const idx = Number(actionBtn.dataset.idx);
      if (b && b.items.length > 1) {
        b.items.splice(idx, 1);
        renderBill();
      } else {
        toast('A bill must have at least one item.', true);
      }
      break;
    }

    case 'sync-calculated-total': {
      const b = currentBill();
      if (b) {
        b.statedTotal = null;
        renderBill();
        toast('Synchronized to calculated total.');
      }
      break;
    }

    case 'go-to-assign': {
      syncBillFromDom();
      const b = currentBill();
      if (!b || !b.items.length) {
        toast('Please add at least one item.', true);
        return;
      }
      if (b.items.some(i => !i.name.trim())) {
        toast('Please provide a name for every item.', true);
        return;
      }
      if (members().length === 0) {
        toast('Please add members to the group before assigning.', true);
        go('groups');
        return;
      }
      go('assign');
      break;
    }

    case 'back-to-bill': {
      go('bill');
      break;
    }

    case 'scan-receipt': {
      handleReceiptScan();
      break;
    }

    case 'reopen-bill': {
      const id = actionBtn.dataset.id;
      const rec = S.recent.find(r => r.id === id);
      if (rec && rec.session) {
        S.outingSession = rec.session;
        S.activeGroup = rec.group || S.rosters.find(g => g.id === rec.session.groupId) || S.rosters[0];
        persistActiveOuting();
        toast(`Reopened "${rec.restaurantName}".`);
        go('breakdown');
      } else {
        toast('Could not restore full session for this bill.', true);
      }
      break;
    }
  }
}
