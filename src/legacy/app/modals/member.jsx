/** SplitSmart — Member edit modal. */
import { uid, saveRosters } from '../../state.jsx';
import { $, S, toast } from '../core.jsx';
import { renderGroups } from '../views/groups.jsx';

// Member Form Modal
export function openMemberModal(groupId, memberId) {
  const g = S.rosters.find(x => x.id === groupId);
  if (!g) return;
  const m = memberId ? g.members.find(x => x.id === memberId) : null;
  const form = $('#member-form');

  form.elements.id.value = m?.id || '';
  form.elements.name.value = m?.name || '';
  form.elements.upiId.value = m?.upiId || '';
  form.elements.dietaryTag.value = m?.dietaryTag || 'ANY';
  form.dataset.groupId = groupId;

  $('#member-dialog-title').textContent = m ? 'Edit Member' : 'Add Member';
  $('#member-dialog').showModal();
}

$('#member-form')?.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.currentTarget;
  const gid = form.dataset.groupId;
  const g = S.rosters.find(x => x.id === gid);
  if (!g) return;

  const id = form.elements.id.value;
  const name = form.elements.name.value.trim();
  const upiId = form.elements.upiId.value.trim();
  const dietaryTag = form.elements.dietaryTag.value;

  if (!name) return;

  // Duplicate name check
  if (g.members.some(m => m.id !== id && m.name.toLowerCase() === name.toLowerCase())) {
    toast(`A member named "${name}" already exists in this group.`, true);
    return;
  }

  if (id) {
    g.members = g.members.map(m => m.id === id ? { ...m, name, upiId, dietaryTag, example: false } : m);
    toast(`Updated "${name}".`);
  } else {
    if (g.members.length >= 30) {
      toast('Groups can have up to 30 members.', true);
      return;
    }
    g.members.push({ id: uid('person'), name, upiId, dietaryTag, example: false });
    toast(`Added "${name}".`);
  }

  saveRosters(S.rosters);
  $('#member-dialog').close();
  renderGroups();
});
