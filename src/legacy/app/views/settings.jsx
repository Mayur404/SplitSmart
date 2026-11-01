/** SplitSmart — Settings view. */
import { $ } from '../core.jsx';
import { renderHeader } from './chrome.jsx';

export function renderSettings() {
  $('#app').innerHTML = `
    <div class="settings-page">
    ${renderHeader('Settings', 'Optional tools and local data.')}

    <section class="panel">
      <h2>Local data</h2>
      <p class="panel-intro">Groups and recent bills stay in this browser.</p>

      <div class="button-row">
        <button class="button button-secondary button-small" data-action="export-backup">Export Group Backup (JSON)</button>
        <button class="button button-secondary button-small" data-action="clear-history">Clear Recent Bills</button>
        <button class="button button-danger button-small" data-action="wipe-all-data">Wipe All Local Data</button>
      </div>
    </section>

    <section class="panel">
      <h2>Calculation check</h2>
      <p class="panel-intro">Run the built-in paise and settlement checks.</p>
      <div class="button-row">
        <button class="button button-secondary button-small" data-action="run-financial-tests">Run Calculation Checks</button>
      </div>
      <div id="test-results-output" style="margin-top:12px;font-family:var(--font-mono);font-size:12.5px;"></div>
    </section>
    </div>
  `;
}
