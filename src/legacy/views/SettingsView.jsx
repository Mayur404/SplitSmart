/* eslint-disable react-refresh/only-export-components */
/**
 * SettingsView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildSettingsMarkup(ctx) {
  const { renderHeader, esc, settings } = ctx;

  return `
    ${renderHeader('Settings', 'Configure optional receipt scanning, local storage, and privacy preferences.')}

    <section class="panel">
      <h2>Gemini AI Receipt Scanner (Optional)</h2>
      <div class="warning">
        🔒 <strong>Client-Side Security Notice:</strong>
        SplitSmart runs 100% in your browser. Any API key entered here is held in your browser memory and only saved locally if you explicitly choose to persist it.
        Keys are never sent to any server other than directly to Google's official Gemini API endpoint.
      </div>

      <div class="field-grid">
        <label class="full">
          Google Gemini API Key
          <input type="password" id="gemini-key-input" data-validate="api-key" value="${esc(settings.apiKey)}" placeholder="AIzaSy..." autocomplete="off" maxlength="200" aria-describedby="gemini-key-help">
          <small id="gemini-key-help" class="quiet">Optional. If entered, use a 20–200 character API key without spaces.</small>
        </label>
        <label class="full" style="flex-direction:row;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" id="save-key-checkbox" ${settings.saveKey ? 'checked' : ''} style="width:auto;">
          <span>Remember this key on this device (localStorage)</span>
        </label>
        <label class="full">
          Model Preference
          <select id="gemini-model-select" data-validate="model">
            <option value="auto" ${settings.selectedModel === 'auto' ? 'selected' : ''}>Auto-detect / Fallback Cascade (Recommended)</option>
            <option value="gemini-2.5-flash" ${settings.selectedModel === 'gemini-2.5-flash' ? 'selected' : ''}>gemini-2.5-flash</option>
            <option value="gemini-2.0-flash" ${settings.selectedModel === 'gemini-2.0-flash' ? 'selected' : ''}>gemini-2.0-flash</option>
            <option value="gemini-1.5-flash" ${settings.selectedModel === 'gemini-1.5-flash' ? 'selected' : ''}>gemini-1.5-flash</option>
            <option value="gemini-3.5-flash-lite" ${settings.selectedModel === 'gemini-3.5-flash-lite' ? 'selected' : ''}>gemini-3.5-flash-lite</option>
            <option value="gemini-3.8-flash" ${settings.selectedModel === 'gemini-3.8-flash' ? 'selected' : ''}>gemini-3.8-flash</option>
          </select>
        </label>
      </div>

      <div class="button-row">
        <button class="button button-primary button-small" data-action="save-api-key">Save Settings</button>
        <button class="button button-secondary button-small" data-action="test-api-key">Test Key &amp; Check Models</button>
        <button class="button button-secondary button-small" data-action="clear-api-key">Remove Key</button>
      </div>
      <div id="test-key-result" style="margin-top:12px;font-size:13px;"></div>
    </section>

    <section class="panel">
      <h2>Data Management</h2>
      <p class="panel-intro">SplitSmart stores your groups and recent bills locally in your browser storage.</p>

      <div class="button-row">
        <button class="button button-secondary button-small" data-action="export-backup">Export Group Backup (JSON)</button>
        <button class="button button-secondary button-small" data-action="clear-history">Clear Recent Bills</button>
        <button class="button button-danger button-small" data-action="wipe-all-data">Wipe All Local Data</button>
      </div>
    </section>

    <section class="panel">
      <h2>Financial Engine Validation</h2>
      <p class="panel-intro">Run internal self-tests for mathematical invariants (proportional shares, largest remainder penny rounding, cash flow balance).</p>
      <div class="button-row">
        <button class="button button-secondary button-small" data-action="run-financial-tests">Run Calculation Checks</button>
      </div>
      <div id="test-results-output" style="margin-top:12px;font-family:var(--font-mono);font-size:12.5px;"></div>
    </section>
  `;
}

export default function SettingsView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="settings"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
