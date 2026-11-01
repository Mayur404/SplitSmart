import { unrollItem, undoUnrollItem } from '../../algorithm.jsx';
import { executeNaturalLanguageCommand, handleVoiceCommand } from '../commands.jsx';
import { $, S, currentBill, members, toast } from '../core.jsx';
import { go } from '../router.jsx';
import { renderAssign, toggleItemAssignment } from '../views/assign.jsx';

export const ACTIONS = [
  'select-assignee',
  'toggle-assignment',
  'auto-split-diet',
  'split-remaining-equally',
  'unroll-single',
  'regroup-units',
  'unroll-all',
  'undo-unroll',
  'run-command',
  'voice-command',
  'filter-diet',
  'go-to-breakdown',
  'back-to-assign'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'select-assignee': {
      S.assignActiveMemberId = actionBtn.dataset.memberId;
      renderAssign();
      $(`.ap-person[data-member-id="${CSS.escape(S.assignActiveMemberId)}"]`)?.focus({ preventScroll: true });
      break;
    }

    case 'toggle-assignment': {
      const itemId = actionBtn.dataset.itemId;
      const memberId = actionBtn.dataset.memberId;
      if (!memberId) { toast('Pick a person first.', true); break; }
      toggleItemAssignment(itemId, memberId);
      break;
    }

    case 'auto-split-diet': {
      const b = currentBill();
      if (!b) return;
      const gMembers = members();

      let changed = 0;
      b.items.forEach(item => {
        if (item.category === 'VEG') {
          const eligible = gMembers.filter(m => m.dietaryTag === 'VEG').map(m => m.id);
          if (eligible.length) { item.assignments = eligible; changed++; }
        } else if (item.category === 'NON-VEG') {
          const eligible = gMembers.filter(m => m.dietaryTag === 'NON-VEG').map(m => m.id);
          if (eligible.length) { item.assignments = eligible; changed++; }
        }
      });

      toast(`Dietary preferences applied to ${changed} item(s).`);
      renderAssign();
      break;
    }

    case 'split-remaining-equally': {
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
      toast(`Split ${count} unassigned item(s) equally across all members.`);
      renderAssign();
      break;
    }

    case 'unroll-single': {
      const b = currentBill();
      const idx = Number(actionBtn.dataset.idx);
      if (b && b.items[idx]) {
        const original = b.items[idx];
        const unrolled = unrollItem(original);
        if (unrolled) {
          S.previousUnrolls.push({ type: 'single', original, items: unrolled });
          b.items.splice(idx, 1, ...unrolled);
          toast(`Unrolled "${original.name}" into ${unrolled.length} units.`);
          renderAssign();
        }
      }
      break;
    }

    case 'regroup-units': {
      // Reverse of "Split into units": merge one item's units back into the original grouped item.
      const b = currentBill();
      const gid = actionBtn.dataset.group;
      if (!b || !gid) return;
      const idxs = b.items.map((it, i) => (it.unrolledFrom === gid ? i : -1)).filter(i => i >= 0);
      if (idxs.length < 2) return;
      const units = idxs.map(i => b.items[i]);
      const key = u => [...new Set(u.assignments || [])].sort().join('|');
      const uniform = units.every(u => key(u) === key(units[0]));
      const union = [...new Set(units.flatMap(u => u.assignments || []))];
      if (!uniform) {
        const who = union.map(id => members().find(m => m.id === id)?.name || 'Unknown').join(', ');
        const ok = confirm(`These ${units.length} units are assigned to different people.\n\nCombining them shares the whole item equally between everyone assigned to any unit (${who}).\n\nCombine anyway?`);
        if (!ok) return;
      }
      // Rebuild from the saved original when this session unrolled it, otherwise from the units themselves.
      let original = null;
      S.previousUnrolls.forEach(rec => {
        if (rec.type === 'single' && rec.original.id === gid) original = rec.original;
        if (rec.type === 'batch') rec.records.forEach(r => { if (r.original.id === gid) original = r.original; });
      });
      const totalPaise = units.reduce((a, u) => a + Math.trunc(Number(u.totalPaise) || 0), 0);   // exact: units were built to sum to the original
      const merged = { ...units[0], ...(original || {}), id: gid, quantity: units.length, totalPaise, assignments: union };
      if (!original) {
        merged.name = String(units[0].name || '').replace(/\s*\(\d+\/\d+\)\s*$/, '');
        merged.unitPaise = Math.round(totalPaise / units.length);
      }
      delete merged.unrolledFrom;
      const next = [];
      b.items.forEach((it, i) => { if (i === idxs[0]) next.push(merged); else if (!idxs.includes(i)) next.push(it); });
      b.items = next;
      // The undo stack must not re-add this original a second time.
      S.previousUnrolls = S.previousUnrolls
        .map(rec => (rec.type === 'batch' ? { ...rec, records: rec.records.filter(r => r.original.id !== gid) } : rec))
        .filter(rec => !(rec.type === 'single' && rec.original.id === gid) && !(rec.type === 'batch' && !rec.records.length));
      toast(`Combined ${units.length} units back into "${merged.name}".`);
      renderAssign();
      break;
    }

    case 'unroll-all': {
      const b = currentBill();
      if (!b) return;
      let unrolledAny = false;
      const nextItems = [];
      const unrollHistory = [];

      b.items.forEach(item => {
        const res = unrollItem(item);
        if (res) {
          unrolledAny = true;
          unrollHistory.push({ original: item, unrolled: res });
          nextItems.push(...res);
        } else {
          nextItems.push(item);
        }
      });

      if (unrolledAny) {
        S.previousUnrolls.push({ type: 'batch', records: unrollHistory });
        b.items = nextItems;
        toast('All quantities unrolled into individual units.');
        renderAssign();
      } else {
        toast('No items with quantity > 1 found to unroll.');
      }
      break;
    }

    case 'undo-unroll': {
      const b = currentBill();
      if (!b || !S.previousUnrolls.length) return;
      const last = S.previousUnrolls.pop();

      if (last.type === 'single') {
        b.items = undoUnrollItem(b.items, last.original);
      } else if (last.type === 'batch') {
        last.records.forEach(rec => {
          b.items = undoUnrollItem(b.items, rec.original);
        });
      }
      toast('Undo unroll completed.');
      renderAssign();
      break;
    }

    case 'run-command': {
      const input = $('#command-input');
      if (input) {
        executeNaturalLanguageCommand(input.value);
        input.value = '';
      }
      break;
    }

    case 'voice-command': {
      handleVoiceCommand();
      break;
    }

    case 'filter-diet': {
      S.assignmentDietFilter = actionBtn.dataset.filter;
      renderAssign();
      break;
    }

    case 'go-to-breakdown': {
      go('breakdown');
      break;
    }

    case 'back-to-assign': {
      go('assign');
      break;
    }
  }
}
