import { freshRoster, saveRosters } from '../../state.jsx';
import { $, S, toast } from '../core.jsx';
import { openMemberModal } from '../modals/member.jsx';
import { renderGroups } from '../views/groups.jsx';

export const ACTIONS = [
  'create-group',
  'add-template',
  'rename-group',
  'delete-group',
  'add-member',
  'edit-member',
  'delete-member',
  'close-member'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'create-group': {
      const name = prompt('Enter group name (e.g. Goa Trip, Flat 402):');
      if (name && name.trim()) {
        const g = freshRoster(name.trim(), 4);
        S.rosters.push(g);
        saveRosters(S.rosters);
        toast(`Group "${g.name}" created.`);
        renderGroups();
      }
      break;
    }

    case 'add-template': {
      const name = actionBtn.dataset.name;
      const count = Number(actionBtn.dataset.count) || 4;
      const g = freshRoster(name, count);
      S.rosters.push(g);
      saveRosters(S.rosters);
      toast(`Template "${g.name}" added to groups.`);
      renderGroups();
      break;
    }

    case 'rename-group': {
      const g = S.rosters.find(x => x.id === actionBtn.dataset.id);
      if (g) {
        const newName = prompt('Rename group:', g.name);
        if (newName && newName.trim()) {
          g.name = newName.trim().slice(0, 80);
          saveRosters(S.rosters);
          renderGroups();
        }
      }
      break;
    }

    case 'delete-group': {
      const id = actionBtn.dataset.id;
      if (confirm('Delete this group and its member profiles?')) {
        S.rosters = S.rosters.filter(x => x.id !== id);
        saveRosters(S.rosters);
        if (S.activeGroup?.id === id) S.activeGroup = S.rosters[0] || null;
        toast('Group deleted.');
        renderGroups();
      }
      break;
    }

    case 'add-member': {
      openMemberModal(actionBtn.dataset.group, null);
      break;
    }

    case 'edit-member': {
      openMemberModal(actionBtn.dataset.group, actionBtn.dataset.id);
      break;
    }

    case 'delete-member': {
      const gid = actionBtn.dataset.group;
      const mid = actionBtn.dataset.id;
      const g = S.rosters.find(x => x.id === gid);
      if (g && confirm('Remove this member profile?')) {
        g.members = g.members.filter(m => m.id !== mid);
        saveRosters(S.rosters);
        renderGroups();
      }
      break;
    }

    case 'close-member': {
      $('#member-dialog').close();
      break;
    }
  }
}
