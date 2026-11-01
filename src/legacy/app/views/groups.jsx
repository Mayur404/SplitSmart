import { templates } from '../../state.jsx';
import { $, S, esc, icon } from '../core.jsx';
import { renderHeader } from './chrome.jsx';

export function renderGroups() {
  const tpls = templates();
  const groupCards = S.rosters.map(g => {
    const isCurrent = S.activeGroup?.id === g.id;
    const membersHtml = g.members.map(m => `
      <div class="list-row" style="padding:10px 4px;">
        <div class="member-initial" style="width:30px;height:30px;font-size:12px;">${esc(m.name.slice(0, 1).toUpperCase())}</div>
        <div class="list-row-main">
          <div style="font-weight:600;font-size:14px;">
            ${esc(m.name)}
            ${g.primaryPayerId === m.id ? '<span class="pill" style="margin-left:6px;background:var(--accent-soft);color:var(--accent);">Primary Payer</span>' : ''}
          </div>
          <div class="quiet" style="font-size:12px;">
            <span class="pill ${m.dietaryTag === 'VEG' ? 'pill-veg' : m.dietaryTag === 'NON-VEG' ? 'pill-non-veg' : ''}">${esc(m.dietaryTag)}</span>
            ${m.upiId ? ` · ${esc(m.upiId)}` : ' · No UPI'}
            ${m.example ? ' · <span style="color:var(--warning)">Example (Editable)</span>' : ''}
          </div>
        </div>
        <div class="row-tail">
          <button class="button button-quiet button-small" data-action="edit-member" data-group="${esc(g.id)}" data-id="${esc(m.id)}">Edit</button>
          <button class="button button-quiet button-small danger-text" data-action="delete-member" data-group="${esc(g.id)}" data-id="${esc(m.id)}">Remove</button>
        </div>
      </div>
    `).join('');

    return `
      <section class="panel" data-group-card="${esc(g.id)}">
        <div class="section-head">
          <div>
            <h2>${esc(g.name)} ${isCurrent ? '<span class="pill">Active</span>' : ''}</h2>
            <p>${g.members.length} member${g.members.length === 1 ? '' : 's'} (max 30)</p>
          </div>
          <div class="button-row" style="margin:0;">
            <button class="button button-primary button-small" data-action="use-group-bill" data-id="${esc(g.id)}">Start Bill</button>
            <button class="button button-secondary button-small" data-action="rename-group" data-id="${esc(g.id)}">Rename</button>
            <button class="button button-danger button-small" data-action="delete-group" data-id="${esc(g.id)}">Delete</button>
          </div>
        </div>

        <div style="margin:12px 0;">
          <input type="search" placeholder="Search members in ${esc(g.name)}…" data-search-group="${esc(g.id)}" style="max-width:320px;">
        </div>

        <div class="list" data-member-list="${esc(g.id)}">
          ${membersHtml || '<p class="quiet" style="padding:14px 0;">No members in this group yet.</p>'}
        </div>

        <div class="button-row">
          <button class="button button-secondary button-small" data-action="add-member" data-group="${esc(g.id)}">${icon('plus')} Add member</button>
          ${g.members.length > 0 ? `
            <select data-action="set-primary-payer" data-group="${esc(g.id)}" style="max-width:240px;height:34px;padding:4px 8px;font-size:13px;">
              <option value="">-- Set Default Payer --</option>
              ${g.members.map(m => `<option value="${esc(m.id)}" ${g.primaryPayerId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}
            </select>
          ` : ''}
        </div>
      </section>
    `;
  }).join('');

  $('#app').innerHTML = `
    <div class="groups-page">
    ${renderHeader('Groups', 'People, preferences, and payment details.', `
      <button class="button button-primary" data-action="create-group">${icon('plus')} New group</button>
    `)}

    <div class="panel" style="background:var(--surface-alt);border-style:dashed;">
      <h3 style="font-size:15px;margin-bottom:8px;">Start with a template</h3>
      <p class="quiet" style="font-size:13px;margin-bottom:14px;">Editable sample rosters for a quick start.</p>
      <div class="button-row" style="margin:0;">
        ${tpls.map(t => `
          <button class="button button-secondary button-small" data-action="add-template" data-name="${esc(t.name)}" data-count="${t.members.length}">
             ${icon('plus')} ${esc(t.name)} (${t.members.length})
          </button>
        `).join('')}
      </div>
    </div>

    ${groupCards || `
      <div class="empty">
        <h3>No groups yet</h3>
        <p>Create a group from scratch or choose a preset template above.</p>
      </div>
    `}

    <section class="panel">
      <h2>Backup</h2>
      <p class="panel-intro">Export or restore your rosters.</p>
      <div class="button-row">
        <button class="button button-secondary" data-action="export-backup">Export JSON Backup</button>
        <label class="button button-secondary" style="margin:0;cursor:pointer;">
          Import JSON Backup
          <input type="file" id="backup-file-input" accept="application/json,.json" style="display:none;">
        </label>
      </div>
    </section>
    </div>
  `;
}
