/* eslint-disable react-refresh/only-export-components */
/** Settings screen: model preference and environment-backed receipt scanner status. */
export function buildSettingsMarkup(ctx) {
  const { geminiConfigured, settings, renderHeader } = ctx;
  return `
    ${renderHeader('Settings', 'Configure receipt scanning, local storage, and privacy preferences.')}

    <section class="panel">
      <h2>Gemini AI Receipt Scanner</h2>
      ${geminiConfigured
        ? '<div class="success" role="status">✓ Gemini is configured through your local environment.</div>'
        : '<div class="warning" role="alert">Gemini is not configured. Add <code>VITE_GEMINI_API_KEY</code> to your local <code>.env</code> file and restart the Vite development server.</div>'}
      <p class="panel-intro">The API key is not entered or saved in SplitSmart settings. Model preference is stored locally; credentials are read from the environment.</p>
      <div class="field-grid">
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
          <small class="quiet">Changing this selection saves the model preference automatically.</small>
        </label>
      </div>
      <div class="button-row">
        <button class="button button-secondary button-small" data-action="test-gemini-connection">Test Gemini Connection</button>
      </div>
      <div id="test-key-result" role="status" aria-live="polite" style="margin-top:12px;font-size:13px;"></div>
      <p class="quiet">Development note: Vite exposes variables prefixed with <code>VITE_</code> to browser code. Do not use this client-side setup for a production secret; use a backend proxy for production deployments.</p>
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
      <div class="button-row"><button class="button button-secondary button-small" data-action="run-financial-tests">Run Calculation Checks</button></div>
      <div id="test-results-output" style="margin-top:12px;font-family:var(--font-mono);font-size:12.5px;"></div>
    </section>
  `;
}

export default function SettingsView({ markup = '' }) {
  return <div className="legacy-view-root" data-legacy-view="settings" dangerouslySetInnerHTML={{ __html: markup }} />;
}
