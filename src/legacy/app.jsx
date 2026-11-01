/**
 * SplitSmart — app.jsx
 * Application entry point. The implementation lives in ./app/:
 *   core.jsx        shared state (S), DOM helpers, icons, toast
 *   router.jsx      navigation + render() dispatcher
 *   views/          one file per screen
 *   actions/        click-action handlers (grouped by feature)
 *   gas/            Google Apps Script claim sharing
 *   modals/, pages/, effects.jsx, commands.jsx, listeners.jsx, events.jsx, sidebar.jsx
 */
import { S, applyTheme } from './app/core.jsx';
import { render } from './app/router.jsx';
import { renderClaim } from './app/views/claim.jsx';
import './app/pages/info.jsx';
import './app/modals/member.jsx';
import './app/events.jsx';
import './app/listeners.jsx';
import './app/sidebar.jsx';

applyTheme(S.settings.theme);

// URL Hash Change Handler
window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#data=')) {
    renderClaim();
  }
});

// Initial Mount
if (window.location.hash.startsWith('#data=')) {
  renderClaim();
} else {
  render();
}
