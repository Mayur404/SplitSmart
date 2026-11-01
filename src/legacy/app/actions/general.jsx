/** SplitSmart — Click action handlers: general. */
import { getRosters, saveRecent, getSettings, saveSettings, exportBackup } from '../../state.jsx';
import { runSelfTests } from '../../algorithm.jsx';
import { $, S, applyTheme, esc, icon, toast } from '../core.jsx';
import { initOuting, saveCurrentOutingToRecent } from '../outing.jsx';
import { go } from '../router.jsx';
import { renderDashboard } from '../views/dashboard.jsx';

export const ACTIONS = [
  'info-back',
  'toggle-theme',
  'new-bill',
  'use-group-bill',
  'export-backup',
  'clear-history',
  'wipe-all-data',
  'run-financial-tests',
  'save-draft',
  'save-current-bill',
  'close-ambiguity'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'info-back': {
      go('dashboard');
      break;
    }

    case 'toggle-theme': {
      S.settings.theme = S.settings.theme === 'dark' ? 'light' : 'dark';
      saveSettings(S.settings);
      applyTheme(S.settings.theme);
      break;
    }

    case 'new-bill': {
      initOuting(S.activeGroup);
      break;
    }

    case 'use-group-bill': {
      const g = S.rosters.find(x => x.id === actionBtn.dataset.id);
      if (g) initOuting(g);
      break;
    }

    case 'export-backup': {
      const backup = exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `splitsmart-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('JSON backup exported.');
      break;
    }

    case 'clear-history': {
      if (confirm('Clear your recent bill history?')) {
        S.recent = [];
        saveRecent(S.recent);
        toast('Recent bills cleared.');
        renderDashboard();
      }
      break;
    }

    case 'wipe-all-data': {
      if (confirm('Permanently wipe all SplitSmart groups, history, and settings from this device?')) {
        localStorage.clear();
        S.rosters = getRosters();
        S.recent = [];
        S.settings = getSettings();
        toast('All local data wiped.');
        go('dashboard');
      }
      break;
    }

    case 'run-financial-tests': {
      try {
        const res = runSelfTests();
        $('#test-results-output').innerHTML = `<span style="color:var(--success);">${icon('check')} ${esc(res)}</span>`;
      } catch (err) {
        $('#test-results-output').innerHTML = `<span style="color:var(--danger);">${icon('close')} Test failure: ${esc(err.message)}</span>`;
      }
      break;
    }

    case 'save-draft':
    case 'save-current-bill': {
      saveCurrentOutingToRecent();
      break;
    }

    case 'close-ambiguity': {
      $('#ambiguity-dialog').close();
      S.pendingAmbiguityAction = null;
      break;
    }
  }
}
