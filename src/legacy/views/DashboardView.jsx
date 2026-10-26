/* eslint-disable react-refresh/only-export-components */
/**
 * DashboardView prepares the screen markup and renders it inside a React-owned view.
 * data-action attributes are retained for the shared event-delegation controller.
 */
export function buildDashboardMarkup(ctx) {
  const { recent, rosters, settings, esc, formatCurrency, renderHeader } = ctx;

  const recentBills = recent.slice(0, 5);
  const rowsHtml = recentBills
    .map(
      (r) => `
    <div class="list-row">
      <div class="member-initial">${esc((r.restaurantName || 'B').slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(r.restaurantName || 'Shared Outing')}</div>
        <div class="list-row-sub">${esc(r.date || '')} · ${esc(r.groupName || 'Group')} · ${r.peopleCount || 0} participants</div>
      </div>
      <div class="row-tail">
        <span class="amount">${formatCurrency(r.totalPaise || 0)}</span>
        <button class="button button-small button-secondary" data-action="reopen-bill" data-id="${esc(r.id)}">Open</button>
      </div>
    </div>
  `,
    )
    .join('');

  const groupsHtml = rosters
    .slice(0, 4)
    .map(
      (g) => `
    <div class="list-row">
      <div class="member-initial">${esc(g.name.slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(g.name)}</div>
        <div class="list-row-sub">${g.members.length} members ${g.primaryPayerId ? '· Primary payer set' : ''}</div>
      </div>
      <button class="button button-small button-secondary" data-action="use-group-bill" data-id="${esc(g.id)}">Start Bill</button>
    </div>
  `,
    )
    .join('');

  return `
    ${renderHeader('Overview', 'Create a bill, assign what people consumed, and settle up cleanly via UPI.')}

    <section class="hero">
      <h2>One bill. Everyone’s share, figured out.</h2>
      <p>Proportional tax allocation, minimum cash flow debt settlement, and offline-first privacy. No server, no accounts.</p>
      <div class="hero-actions">
        <button class="button button-primary" data-action="new-bill">＋ Create a Bill</button>
        <button class="button button-secondary" data-view="groups">Choose a Group</button>
      </div>
    </section>

    <div class="columns">
      <section>
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Recent Outings</h2>
              <p>Stored locally on this device.</p>
            </div>
            ${recentBills.length ? '<button class="button button-quiet button-small" data-action="clear-history">Clear History</button>' : ''}
          </div>
          ${
            recentBills.length
              ? `<div class="list">${rowsHtml}</div>`
              : `
            <div class="empty">
              <h3>No bills recorded yet</h3>
              <p>Your recent outing summaries will appear here once saved.</p>
              <button class="button button-primary button-small" data-action="new-bill">Create Your First Bill</button>
            </div>
          `
          }
        </div>
      </section>

      <aside>
        <div class="panel">
          <div class="section-head">
            <div>
              <h2>Saved Groups</h2>
              <p>${rosters.length} group${rosters.length === 1 ? '' : 's'} configured</p>
            </div>
            <button class="button button-quiet button-small" data-view="groups">Manage →</button>
          </div>
          ${
            rosters.length
              ? `<div class="list">${groupsHtml}</div>`
              : `
            <div class="empty">
              <h3>No groups yet</h3>
              <p>Pick a template or add a custom group of friends or roommates.</p>
              <button class="button button-secondary button-small" data-view="groups">Create a Group</button>
            </div>
          `
          }
        </div>

        <div class="panel">
          <h2>Optional Gemini Scanning</h2>
          <p class="panel-intro">Scan physical receipts into item lists with Google Gemini 2.5 Flash.</p>
          <p class="quiet" style="font-size:13px;margin-bottom:12px;">
            ${settings.apiKey ? '✓ AI scanner is configured with your API key.' : 'AI scanner is unconfigured. Manual bill entry is fully functional.'}
          </p>
          <button class="button button-secondary button-small" data-view="settings">${settings.apiKey ? 'Manage AI Key' : 'Configure Gemini Key'}</button>
        </div>
      </aside>
    </div>
  `;
}

export default function DashboardView({ markup = '' }) {
  return (
    <div
      className="legacy-view-root"
      data-legacy-view="dashboard"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
