/** SplitSmart — Mobile navigation drawer. */
import { $ } from './core.jsx';

// Mobile navigation drawer with a real scrim and accessible expanded state.
export function setSidebarOpen(open) {
  $('#sidebar')?.classList.toggle('open', open);
  $('#sidebar-scrim')?.classList.toggle('open', open);
  $('#menu-toggle')?.setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('nav-open', open);
}

$('#menu-toggle')?.addEventListener('click', () => {
  setSidebarOpen(!$('#sidebar')?.classList.contains('open'));
});

$('#sidebar-scrim')?.addEventListener('click', () => setSidebarOpen(false));
