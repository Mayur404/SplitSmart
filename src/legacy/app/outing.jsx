/** SplitSmart — Outing session creation and saving to recent history. */
import { uid, freshRoster, saveRecent } from '../state.jsx';
import { S, members, persistActiveOuting, toast } from './core.jsx';
import { go } from './router.jsx';
import { syncBillFromDom } from './views/bill.jsx';
import { computeBillShares } from './views/breakdown.jsx';

// Outing Session Initialization
export function initOuting(group) {
  S.activeGroup = group || S.rosters[0] || freshRoster('My Outing', 4);
  S.outingSession = {
    id: uid('outing'),
    name: 'Dinner Outing',
    groupId: S.activeGroup.id,
    bills: [
      {
        id: uid('bill'),
        restaurantName: '',
        date: new Date().toISOString().slice(0, 10),
        notes: '',
        items: [
          { id: uid('item'), name: '', quantity: 1, unitPaise: 0, totalPaise: 0, category: 'ANY', assignments: [] }
        ],
        tax: { cgst: 0, sgst: 0, gst: 0, serviceCharge: 0 },
        taxBasis: 'independent',
        discount: 0,
        statedTotal: null,
        payers: []
      }
    ]
  };
  S.previousUnrolls = [];
  S.importedClaims = [];
  persistActiveOuting();
  go('bill');
}

// Save Current Outing to Recent History
export function saveCurrentOutingToRecent() {
  syncBillFromDom();
  const calc = computeBillShares();
  if (!calc) return;

  const record = {
    id: S.outingSession.id,
    restaurantName: calc.bill.restaurantName || 'Shared Outing',
    date: calc.bill.date || new Date().toISOString().slice(0, 10),
    groupName: S.activeGroup?.name || 'Group',
    peopleCount: members().length,
    totalPaise: calc.grandTotal,
    group: S.activeGroup,
    session: S.outingSession
  };

  S.recent = [record, ...S.recent.filter(r => r.id !== record.id)].slice(0, 5);
  saveRecent(S.recent);
  toast('Bill saved to recent history.');
}
