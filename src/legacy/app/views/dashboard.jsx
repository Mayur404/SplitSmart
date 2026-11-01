
import { formatCurrency } from '../../algorithm.jsx';
import { GEMINI_CONFIGURED } from '../../../config/gemini.jsx';
import { heroStoryMarkup, mountHeroStory } from '../../hero-story.jsx';
import { $, S, esc, icon } from '../core.jsx';
import { renderFooter } from '../pages/info.jsx';

export function renderDashboard() {
  const recentBills = S.recent.slice(0, 5);
  const rowsHtml = recentBills.map(r => `
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
  `).join('');

  const groupsHtml = S.rosters.slice(0, 4).map(g => `
    <div class="list-row">
      <div class="member-initial">${esc(g.name.slice(0, 1).toUpperCase())}</div>
      <div class="list-row-main">
        <div class="list-row-title">${esc(g.name)}</div>
        <div class="list-row-sub">${g.members.length} members ${g.primaryPayerId ? '· Primary payer set' : ''}</div>
      </div>
      <button class="button button-small button-secondary" data-action="use-group-bill" data-id="${esc(g.id)}">Start Bill</button>
    </div>
  `).join('');

  $('#app').innerHTML = `
    <div class="dashboard-page">
      <section class="dashboard-hero">
        <div class="dashboard-intro">
          <h1>Good times.<br><em>Clear accounts.</em></h1>
          <p>Split a bill, keep every item visible, and settle with confidence.</p>
          <div class="hero-actions">
            <button class="button button-primary button-large" data-action="new-bill">Start a bill ${icon('arrowRight')}</button>
            <button class="button button-text" data-view="groups">Open groups ${icon('arrowRight')}</button>
          </div>
        </div>
        <div class="dashboard-preview">
          ${heroStoryMarkup()}
        </div>
      </section>

      <section class="metric-grid" aria-label="Workspace summary">
        <div class="metric-card"><span class="metric-label">Saved bills</span><strong>${S.recent.length}</strong><span class="metric-meta">on this device</span></div>
        <div class="metric-card"><span class="metric-label">Active groups</span><strong>${S.rosters.length}</strong><span class="metric-meta">ready for a new bill</span></div>
        <div class="metric-card metric-card-accent"><span class="metric-label">Calculation engine</span><strong>₹</strong><span class="metric-meta">exact to the paisa</span></div>
      </section>

      <section class="dashboard-grid">
        <section class="panel record-panel"><div class="section-head"><div><div class="eyebrow">History</div><h2>Recent bills</h2></div><button class="button button-quiet button-small" data-action="clear-history" ${recentBills.length ? '' : 'disabled'}>Clear</button></div>${recentBills.length ? `<div class="list">${rowsHtml}</div>` : `<div class="empty"><h3>No saved bills</h3><p>Your next settled outing will appear here.</p><button class="button button-primary button-small" data-action="new-bill">Create a bill ${icon('arrowRight')}</button></div>`}</section>
        <section class="panel record-panel"><div class="section-head"><div><div class="eyebrow">People</div><h2>Groups</h2></div><button class="button button-quiet button-small" data-view="groups">Manage ${icon('arrowRight')}</button></div>${S.rosters.length ? `<div class="list">${groupsHtml}</div>` : `<div class="empty"><h3>No groups</h3><p>Add the people you split with.</p></div>`}</section>
      </section>

       <section class="dashboard-footer"><div><div class="eyebrow">Private by default</div><strong>Manual bills work offline.</strong><p>${GEMINI_CONFIGURED ? 'Receipt scanning is available as an optional shortcut.' : 'Receipt scanning is optional and not enabled on this deployment.'}</p></div><button class="button button-secondary" data-view="settings">Open settings ${icon('arrowRight')}</button></section>
       ${renderFooter()}
    </div>
  `;
  mountHeroStory($('[data-hero-story]'));
}
