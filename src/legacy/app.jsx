import { S, applyTheme } from './app/core.jsx';
import { render } from './app/router.jsx';
import { renderClaim } from './app/views/claim.jsx';
import './app/pages/info.jsx';
import './app/modals/member.jsx';
import './app/events.jsx';
import './app/listeners.jsx';
import './app/sidebar.jsx';

applyTheme(S.settings.theme);

window.addEventListener('hashchange', () => {
  if (window.location.hash.startsWith('#data=')) {
    renderClaim();
  }
});

if (window.location.hash.startsWith('#data=')) {
  renderClaim();
} else {
  render();
}
