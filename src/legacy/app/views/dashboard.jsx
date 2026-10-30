/* eslint-disable react-refresh/only-export-components */
/** Dashboard screen markup. Interaction continues through the app's delegated actions. */
export function buildDashboardMarkup(ctx) {
  const { recent, rosters, geminiConfigured, esc, formatCurrency } = ctx;
  const recentBills = recent.slice(0, 5);
  const rowsHtml = recentBills.map((bill) => `
    <div class="list-row dashboard-list-row">
      <div class="member-initial">${esc((bill.restaurantName || 'B').slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(bill.restaurantName || 'Shared Outing')}</div>
        <div class="list-row-sub">${esc(bill.date || '')} · ${esc(bill.groupName || 'Group')} · ${bill.peopleCount || 0} participants</div>
      </div>
      <div class="row-tail">
        <span class="amount">${formatCurrency(bill.totalPaise || 0)}</span>
        <button class="button button-small button-secondary" data-action="reopen-bill" data-id="${esc(bill.id)}">Open</button>
      </div>
    </div>
  `).join('');

  const groupsHtml = rosters.slice(0, 4).map((group) => `
    <div class="list-row dashboard-list-row">
      <div class="member-initial">${esc(group.name.slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(group.name)}</div>
        <div class="list-row-sub">${group.members.length} members</div>
      </div>
      <button class="button button-small button-secondary" data-action="use-group-bill" data-id="${esc(group.id)}">Start Bill</button>
    </div>
  `).join('');

  return `
    <section class="hero dashboard-hero">
      <div class="dashboard-hero-copy">
        <span class="dashboard-eyebrow">SPLITSMART · FAIR BY DESIGN</span>
        <h2>Good times.<br>Clear accounts.</h2>
        <p>Split a bill, keep every item visible, and settle with confidence.</p>
        <div class="hero-actions">
          <button class="button button-primary" data-action="new-bill">Start a bill <span aria-hidden="true">→</span></button>
          <button class="button button-quiet" data-view="groups">Open groups <span aria-hidden="true">→</span></button>
        </div>
      </div>

      <div class="hero-art-panel" aria-label="Illustration of a fair group bill split">
        <div class="hero-art-heading">
          <strong>Fair splits.</strong>
          <span class="hero-art-pulse" aria-hidden="true">Ⅱ</span>
        </div>
        <div class="hero-art-people">
          <div class="hero-art-person">
            <span class="hero-person-figure figure-one"><i></i></span>
            <span class="hero-person-initial">A</span>
            <strong>₹608.28</strong>
          </div>
          <div class="hero-art-person featured">
            <span class="hero-person-figure figure-two"><i></i></span>
            <span class="hero-person-initial">S</span>
            <strong>₹238.96</strong>
          </div>
          <div class="hero-art-person">
            <span class="hero-person-figure figure-three"><i></i></span>
            <span class="hero-person-initial">R</span>
            <strong>₹412.76</strong>
          </div>
        </div>
        <div class="hero-art-branches" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="hero-art-total"><small>Group total</small><strong>₹1,260.00</strong></div>
        <div class="hero-art-plate" aria-hidden="true">
          <div class="plate-food food-one"></div><div class="plate-food food-two"></div>
          <div class="plate-food food-three"></div><div class="plate-food food-four"></div>
        </div>
      </div>
    </section>

    <section class="dashboard-stats" aria-label="SplitSmart summary">
      <div class="dashboard-stat">
        <div><span>SAVED BILLS</span><small>on this device</small></div>
        <strong>${recent.length}</strong>
      </div>
      <div class="dashboard-stat">
        <div><span>ACTIVE GROUPS</span><small>ready for a new bill</small></div>
        <strong>${rosters.length}</strong>
      </div>
      <div class="dashboard-stat dashboard-stat--accent">
        <div><span>CALCULATION ENGINE</span><small>exact to the paisa</small></div>
        <strong aria-hidden="true">₹</strong>
      </div>
    </section>

    <div class="dashboard-lower">
      <section class="panel dashboard-panel">
        <div class="section-head">
          <div><span class="dashboard-section-label">HISTORY</span><h2>Recent bills</h2></div>
          ${recentBills.length ? '<button class="button button-quiet button-small" data-action="clear-history">Clear</button>' : ''}
        </div>
        ${recentBills.length ? `<div class="list">${rowsHtml}</div>` : `
          <div class="empty"><h3>No bills recorded yet</h3><p>Your recent outing summaries will appear here once saved.</p><button class="button button-primary button-small" data-action="new-bill">Create your first bill</button></div>
        `}
      </section>

      <section class="panel dashboard-panel">
        <div class="section-head">
          <div><span class="dashboard-section-label">PEOPLE</span><h2>Groups</h2></div>
          <button class="button button-quiet button-small" data-view="groups">Manage →</button>
        </div>
        ${rosters.length ? `<div class="list">${groupsHtml}</div>` : `
          <div class="empty"><h3>No groups yet</h3><p>Create a group of friends or roommates to start splitting.</p><button class="button button-secondary button-small" data-view="groups">Create a group</button></div>
        `}
      </section>
    </div>

    <section class="dashboard-privacy-panel">
      <div><span>PRIVATE BY DEFAULT</span><strong>Manual bills work offline.</strong><small>${geminiConfigured ? 'Receipt scanning is configured as an optional shortcut.' : 'Receipt scanning is available as an optional shortcut.'}</small></div>
      <button class="button button-secondary" data-view="settings">Open settings <span aria-hidden="true">→</span></button>
    </section>
  `;
}

export default function DashboardView({ markup = '' }) {
  return <div className="legacy-view-root" data-legacy-view="dashboard" dangerouslySetInnerHTML={{ __html: markup }} />;
}
