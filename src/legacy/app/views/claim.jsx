/** SplitSmart — Stateless self-claim view (direct link open). */
import { read as readStore, write as writeStore } from '../../state.jsx';
import { formatCurrency, calculateShares, calculateItemTaxCharges, getCombinedTaxRate } from '../../algorithm.jsx';
import { decodeShare, decodePersonalParticipant } from '../../share.jsx';
import { $$, $, S, esc, icon } from '../core.jsx';
import { setNav } from '../router.jsx';

export const expandedClaimItems = new Set();

export const claimMotionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const claimDraftKey = p => {
  const params = new URLSearchParams(window.location.search);
  const formId = params.get('formId') || 'offline';
  const claimRound = params.get('claimRound') || '1';
  return `splitsmart:v2:claim:${formId}:${claimRound}:${p.sessionId}`;
};

/**
 * Totals for one claimant, using the same engine the host uses (calculateShares).
 * The claimant is modelled as one member ('me') and "everyone else" as a second ('rest'),
 * so tax and discount are allocated in proportion to food expenditure exactly as the
 * host's review step does.
 *
 * For every bill item, its total is divided into two portions:
 * - Selected portion: assigned to 'me'
 * - Unselected portion: assigned to 'rest'
 * Preserving the original total food value across both participants.
 */
export function claimTotals(p, selectedIds) {
  const food = p.items.reduce((a, it) => a + it.costPaise, 0);

  const shareItems = [];
  let subtotal = 0;

  p.items.forEach(it => {
    const qty = Math.max(1, Math.trunc(Number(it.quantity) || 1));
    const selectedQty = Array.from({ length: qty }, (_, i) =>
      selectedIds.has(`${it.id}::unit:${i + 1}`)
    ).filter(Boolean).length;

    // Also support existing whole-item selections.
    const wholeSelected = selectedIds.has(it.id);
    const actualQty = wholeSelected ? qty : selectedQty;

    const mePaise = Math.round((it.costPaise * actualQty) / qty);
    const restPaise = it.costPaise - mePaise;

    subtotal += mePaise;

    if (mePaise > 0) {
      shareItems.push({
        id: `${it.id}::me`,
        totalPaise: mePaise,
        assignments: ['me']
      });
    }
    if (restPaise > 0) {
      shareItems.push({
        id: `${it.id}::rest`,
        totalPaise: restPaise,
        assignments: ['rest']
      });
    }
  });

  const restFood = Math.max(0, food - subtotal);

  // 1. STRUCTURED-TAX CLAIM LINKS:
  // taxConfig or taxRates are the strict SOURCE OF TRUTH.
  // We do NOT collapse to p.adjPaise.
  if (p.taxConfig || p.taxRates) {
    const config = { ...(p.taxConfig || {}), ...(p.taxRates || {}), totalFoodPaise: food };
    const rates = getCombinedTaxRate(config);
    const combinedRate = rates.combinedRate;

    const billCharges = calculateItemTaxCharges(food, rates);
    const billDiscount = Math.max(0, Math.trunc(Number(config.discountPaise) || 0));
    const billFixedFee = Math.max(0, Math.trunc(Number(config.fixedFeePaise) || 0));
    const totalBillNetAdjustment = billCharges.totalChargesPaise + billFixedFee - billDiscount;
    const grand = Math.max(0, food + totalBillNetAdjustment);

    if (subtotal === 0) {
      return {
        food,
        adj: totalBillNetAdjustment,
        subtotal: 0,
        taxShare: 0,
        estimate: 0,
        grand,
        rates,
        chargesBreakdown: calculateItemTaxCharges(0, rates),
        rest: {
          foodPaise: food,
          taxDiscountPaise: totalBillNetAdjustment,
          sharePaise: grand
        }
      };
    }

    const meCharges = calculateItemTaxCharges(subtotal, rates);
    const meFixedNet = food > 0 ? Math.round(((billFixedFee - billDiscount) * subtotal) / food) : 0;
    const meTaxShare = meCharges.totalChargesPaise + meFixedNet;

    // Exact reconciliation with rest to prevent paise rounding drift
    const restTaxShare = totalBillNetAdjustment - meTaxShare;
    const restShare = restFood + restTaxShare;
    const estimate = subtotal + meTaxShare;

    return {
      food,
      adj: totalBillNetAdjustment,
      subtotal,
      taxShare: meTaxShare,
      estimate,
      grand,
      rates,
      chargesBreakdown: meCharges,
      rest: {
        foodPaise: restFood,
        taxDiscountPaise: restTaxShare,
        sharePaise: restShare
      }
    };
  }

  // 2. BACKWARD COMPATIBILITY FALLBACK:
  // Older links without taxConfig use the legacy flattened adjPaise
  const adj = Number.isInteger(p.adjPaise) ? p.adjPaise : null;
  const out = {
    food,
    adj,
    subtotal,
    taxShare: 0,
    estimate: subtotal,
    grand: adj === null ? null : Math.max(0, food + adj),
    chargesBreakdown: null,
    rest: {
      foodPaise: restFood,
      taxDiscountPaise: adj !== null ? adj : 0,
      sharePaise: adj === null ? restFood : Math.max(0, food + adj - subtotal)
    }
  };

  if (adj === null || subtotal === 0) return out;

  const [me, rest] = calculateShares(
    shareItems,
    [{ id: 'me', name: 'me' }, { id: 'rest', name: 'rest' }],
    { cgst: Math.max(0, adj) },
    Math.max(0, -adj)
  );

  out.subtotal = me.foodPaise;
  out.taxShare = me.taxDiscountPaise;
  out.estimate = me.sharePaise;
  if (rest) {
    out.rest = {
      foodPaise: rest.foodPaise,
      taxDiscountPaise: rest.taxDiscountPaise,
      sharePaise: rest.sharePaise
    };
  }

  return out;
}

export function claimUnitNote(it) {
  const qty = Number(it.quantity) || 1;
  if (qty <= 1) return '';
  const exact = Number.isInteger(qty) && it.costPaise % qty === 0;
  return `${exact ? '' : '≈ '}${formatCurrency(Math.round(it.costPaise / qty))} each`;
}

export function renderClaim() {
  try {
    S.decodedClaimPayload = decodeShare(window.location.hash);
    S.decodedClaimParticipant = decodePersonalParticipant(window.location.hash, S.decodedClaimPayload);
  } catch (err) {
    $('#app').innerHTML = `
      <div class="claim-page"><div class="panel claim-error">
        <div class="claim-warning-icon" aria-hidden="true">${icon('warning')}</div>
        <h2>Invalid or Expired Link</h2>
        <p style="margin-bottom:20px;">${esc(err.message)}</p>
        <a class="button button-primary" href="${esc(window.location.pathname)}">Open SplitSmart Home</a>
      </div></div>
    `;
    return;
  }

  // Direct link loads bypass render(), so keep the breadcrumb/nav truthful here too.
  S.view = 'claim';
  setNav();

  const p = S.decodedClaimPayload;
  const personalLink = Boolean(S.decodedClaimParticipant);
  const lockedParticipant = S.decodedClaimParticipant;
  const participantRecords = Array.isArray(p.participantRecords) && p.participantRecords.length
    ? p.participantRecords
    : p.participants.map((name, index) => ({ id: `participant-${index + 1}`, name }));

  // Restore this person's draft on this device. Personal links always select their encoded participant.
  const draft = readStore(claimDraftKey(p), null);
  const draftUser = personalLink
    ? lockedParticipant.name
    : (draft && typeof draft.user === 'string' && p.participants.includes(draft.user) ? draft.user : '');
  const draftParticipantId = personalLink ? lockedParticipant.id : (draft?.participantId || '');
  const validIds = new Set(p.items.map(i => i.id));
  const draftIds = new Set(Array.isArray(draft?.ids) ? draft.ids.filter(id => validIds.has(id)) : []);

  const totals = claimTotals(p, new Set());
  const totalLabel = totals.grand === null ? 'Items total' : 'Bill total';
  const totalValue = totals.grand === null ? totals.food : totals.grand;
  const showTax = totals.adj !== null && totals.adj !== 0;

  let taxLabel = 'Tax & discount';
  if (totals.rates && totals.rates.combinedRate > 0) {
    const parts = [];
    if (totals.rates.gstRate > 0) parts.push(`GST ${totals.rates.gstRate}%`);
    if (totals.rates.serviceChargeRate > 0) parts.push(`Service Charge ${totals.rates.serviceChargeRate}%`);
    taxLabel = `Taxes & charges (${totals.rates.combinedRate}%${parts.length ? ` — ${parts.join(' + ')}` : ''})`;
  }

  const visibleParticipants = personalLink
    ? [lockedParticipant]
    : participantRecords;
  const peopleHtml = visibleParticipants.map((person, i) => {
    const n = person.name;
    const selected = personalLink
      ? person.id === lockedParticipant.id
      : (draftParticipantId ? person.id === draftParticipantId : n === draftUser);
    return `
    <label class="claim-person ${personalLink ? 'is-locked' : ''}" style="--i:${Math.min(i, 10)}" data-dnd="person" data-person-id="${esc(person.id)}" data-person-name="${esc(n)}">
      <input type="radio" name="claimant" value="${esc(n)}" data-participant-id="${esc(person.id)}" data-claimant ${selected ? 'checked' : ''} ${personalLink ? 'disabled' : ''}>
      <span class="cp-body">
        <span class="cp-avatar" aria-hidden="true">${esc((n.trim()[0] || '?').toUpperCase())}</span>
        <span class="cp-name">${esc(n)}</span>
        <span class="cp-you" aria-hidden="true">${personalLink ? 'Personal link' : 'You'}</span>
      </span>
    </label>`;
  }).join('');

  // Same badge markup as the host's assignment cards. Shown only when the link carries a real value.
  const claimDietPill = it => ['VEG', 'NON-VEG', 'ANY'].includes(it.category)
    ? `<span class="pill ${it.category === 'VEG' ? 'pill-veg' : it.category === 'NON-VEG' ? 'pill-non-veg' : ''}">${esc(it.category)}</span>`
    : '';
  const renderClaimItem = (it, i, unitLabel = '') => {
    const unit = claimUnitNote(it);
    return `
    <label class="claim-item" style="--i:${Math.min(i, 10) + 2}" data-dnd="item" data-item-id="${esc(it.id)}" data-item-name="${esc(it.name)}" data-item-amount="${esc(formatCurrency(it.costPaise))}" data-members="[]">
      <input type="checkbox" class="ci-input" data-claim-item="${esc(it.id)}" ${draftIds.has(it.id) ? 'checked' : ''}>
      <span class="ci-box" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" pathLength="1"/></svg></span>
      <span class="ci-main">
        <span class="ci-name">${esc(it.name)}${unitLabel ? ` <span class="claim-unit-label">${esc(unitLabel)}</span>` : ''}</span>
        <span class="ci-meta"><span class="ci-qty">${it.quantity > 1 ? `× ${esc(it.quantity)}` : 'Qty 1'}</span>${claimDietPill(it)}${unit ? `<span class="ci-unit">${unit}</span>` : ''}</span>
      </span>
      <span class="ci-price">${formatCurrency(it.costPaise)}</span>
    </label>`;
  };
  // Units the host already unrolled arrive as separate quantity-1 items sharing `unrolledFrom`; keep them grouped.
  const preUnrolledGroups = new Map();
  p.items.forEach(it => {
    if (!it.unrolledFrom) return;
    if (!preUnrolledGroups.has(it.unrolledFrom)) preUnrolledGroups.set(it.unrolledFrom, []);
    preUnrolledGroups.get(it.unrolledFrom).push(it);
  });
  const itemsHtml = p.items.map((it, i) => {
    const qty = Math.trunc(Number(it.quantity) || 1);
    const hostUnits = it.unrolledFrom ? preUnrolledGroups.get(it.unrolledFrom) : null;
    if (hostUnits && hostUnits.length > 1) {
      if (hostUnits[0] !== it) return '';
      const parentName = String(it.name || 'Item').replace(/\s*\(\d+\/\d+\)\s*$/, '');
      return `<div class="claim-unit-group" data-claim-unit-group="${esc(it.unrolledFrom)}">
        <div class="claim-unit-group-head"><strong>${esc(parentName)}${claimDietPill(it) ? ` ${claimDietPill(it)}` : ''}</strong><span class="claim-unit-count">${hostUnits.length} units</span></div>
        <div class="claim-unit-row">${hostUnits.map(unit => renderClaimItem(unit, p.items.indexOf(unit))).join('')}</div>
      </div>`;
    }
    if (qty > 1) {
      const unitCards = Array.from({ length: qty }, (_, unitIndex) =>
        renderClaimItem({
          ...it,
          id: `${it.id}::unit:${unitIndex + 1}`,
          originalItemId: it.id,
          name: it.name,
          costPaise: Math.round(it.costPaise / qty),
          quantity: 1
        }, i, `(${unitIndex + 1}/${qty})`)
      ).join('');
      return `<div class="claim-entry has-split" data-claim-entry-id="${esc(it.id)}">
        <div class="claim-parent-card">${renderClaimItem(it, i)}<button type="button" class="button button-quiet button-small claim-split-button ai-unroll" data-action="claim-toggle-units" data-item-id="${esc(it.id)}" aria-label="Unroll quantity: split ${qty} units of ${esc(it.name)} into individual items">Unroll quantity</button></div>
        <div class="claim-unit-group claim-inline-units" data-claim-unit-group="${esc(it.id)}" hidden>
          <div class="claim-unit-group-head"><strong>${esc(it.name)}${claimDietPill(it) ? ` ${claimDietPill(it)}` : ''}</strong><button type="button" class="button button-quiet button-small ai-unroll" data-action="claim-toggle-units" data-item-id="${esc(it.id)}" aria-label="Combine ${qty} units of ${esc(it.name)} back into one item">Combine units</button></div>
          <div class="claim-unit-row">${unitCards}</div>
        </div>
      </div>`;
    }
    return `<div class="claim-entry">${renderClaimItem(it, i)}</div>`;
  }).join('');

  $('#app').innerHTML = `
    <div class="claim-page">
      <header class="claim-head" style="--i:0">
        <div class="claim-head-main">
          <p class="claim-kicker">Shared bill${p.date ? ` · ${esc(p.date)}` : ''}</p>
          <h1>${esc(p.outing)}</h1>
          <p class="claim-lead">${personalLink ? 'Your name is fixed for this personal link. Tick everything you shared.' : 'Pick your name, then tick everything you shared.'}</p>
        </div>
        <dl class="claim-facts">
          <div><dt>${totalLabel}</dt><dd>${formatCurrency(totalValue)}</dd></div>
          <div><dt>People</dt><dd>${p.participants.length}</dd></div>
          <div><dt>Items</dt><dd>${p.items.length}</dd></div>
        </dl>
        <div class="claim-bar" role="progressbar" aria-label="Items you have selected" aria-valuemin="0" aria-valuemax="${p.items.length}" aria-valuenow="0" data-cs="bar">
          <div class="cb-track"><span class="cb-fill" data-cs="fill"></span></div>
          <span class="cb-label" data-cs="progress">0 of ${p.items.length} items selected</span>
        </div>
      </header>

      <div class="claim-layout">
        <div class="claim-main">
          <fieldset class="claim-who" style="--i:1">
            <legend>${personalLink ? 'Your name (fixed by the owner)' : 'Who are you?'}</legend>
            <div class="claim-people" role="radiogroup" aria-label="Your name" data-cs="people">${peopleHtml}</div>
          </fieldset>

          <section class="claim-items" aria-label="Items on this bill">
            <h2 class="claim-section-title" style="--i:2">What did you share?</h2>
            <div class="claim-grid">${itemsHtml}</div>
            <p class="claim-footnote">Your amount is an estimate, as if you were the only one on these items. Dishes shared with others are split by the host once every claim is in.</p>
          </section>

          <section id="claim-result-box" class="claim-result" aria-live="polite" tabindex="-1"></section>
        </div>

        <aside class="claim-summary" style="--i:3" aria-label="Your claim summary">
          <h2 class="cs-title" data-cs="who">Your claim</h2>
          <div class="cs-lines">
            <div class="cs-line"><span>Selected</span><strong data-cs="count">0 items</strong></div>
            <div class="cs-line"><span>Items</span><strong data-cs="subtotal" data-paise="0">${formatCurrency(0)}</strong></div>
            ${showTax ? `<div class="cs-line"><span>${esc(taxLabel)}</span><strong data-cs="tax" data-signed="1" data-paise="0">${formatCurrency(0)}</strong></div>` : ''}
          </div>
          <div class="cs-total"><span>Estimated amount</span><strong data-cs="estimate" data-paise="0">${formatCurrency(0)}</strong></div>
          <button type="button" class="button button-primary cs-submit" data-action="submit-whatsapp-claim" data-cs="submit" disabled>Prepare WhatsApp claim</button>
          <p class="cs-hint" data-cs="hint">Choose your name to continue.</p>
        </aside>
      </div>
    </div>
  `;

  syncClaim({ initial: true });

  // Contact details are optional; formId identifies the bill for Sheets storage.
  const params = new URLSearchParams(window.location.search);
  if (params.get('formId')) {
    const submitButton = $('[data-action="submit-whatsapp-claim"]');
    if (submitButton) submitButton.textContent = 'Submit claim to owner';
    const resultBox = $('#claim-result-box');
    if (resultBox && !$('#gas-customer-details')) {
      const details = document.createElement('section');
      details.id = 'gas-customer-details';
      details.className = 'panel';
      details.style.marginTop = '14px';
      details.innerHTML = `
        <h2 style="margin-top:0">Your contact details</h2>
        <p class="quiet">Your claim is sent to the bill owner's Google Sheet.</p>
        <label style="display:block;margin:10px 0 5px" for="gas-customer-contact">Contact details (optional)</label>
        <input id="gas-customer-contact" maxlength="200" autocomplete="email" placeholder="Phone, email, or UPI ID" style="width:100%">
        <label style="display:block;margin:10px 0 5px" for="gas-customer-note">Additional note (optional)</label>
        <textarea id="gas-customer-note" maxlength="1000" rows="2" placeholder="Anything the bill owner should know" style="width:100%"></textarea>
      `;
      resultBox.parentNode.insertBefore(details, resultBox);
    }
  }
}

export function readClaimState() {
  const selected = $('input[data-claimant]:checked');
  const user = selected?.value || '';
  const participantId = selected?.dataset.participantId || '';
  const ids = new Set(Array.from($$('[data-claim-item]:checked')).map(b => b.dataset.claimItem));
  return { user, participantId, ids };
}

/** Counts money up/down instead of jumping; falls back to an instant update for reduced motion. */
export function tweenMoney(el, to, instant) {
  if (!el) return;
  const fmt = v => (el.dataset.signed === '1' && v > 0 ? '+' : '') + formatCurrency(v);
  const from = el.__v ?? Number(el.dataset.paise || 0);
  el.dataset.paise = String(to);
  if (el.__raf) cancelAnimationFrame(el.__raf);
  if (instant || from === to || !claimMotionOk()) { el.__v = to; el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 240;
  const step = now => {
    const k = Math.min(1, (now - t0) / dur);
    el.__v = k >= 1 ? to : Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    el.textContent = fmt(el.__v);
    el.__raf = k < 1 ? requestAnimationFrame(step) : 0;
  };
  el.__raf = requestAnimationFrame(step);
}

export function setClaimText(name, text) {
  const el = $(`[data-cs="${name}"]`);
  if (el && el.textContent !== text) el.textContent = text;
}

/** Reflect the form (names, ticks) into cards, progress and totals. Runs on load and on every deliberate change. */
export function syncClaim({ initial = false } = {}) {
  const p = S.decodedClaimPayload;
  if (!p || !$('.claim-page')) return;
  const { user, participantId, ids } = readClaimState();
  const t = claimTotals(p, ids);

  $$('.claim-item').forEach(el => {
    const on = el.querySelector('[data-claim-item]').checked;
    el.classList.toggle('is-selected', on);
    el.dataset.members = JSON.stringify(on && user ? [user] : []);   // read by the scroll picker (motion.jsx)
  });
  $$('.claim-person').forEach(el => el.classList.toggle('is-selected', el.querySelector('input').checked));
  $('[data-cs="people"]')?.classList.toggle('has-selection', !!user);

  const n = p.items.length;
  const bar = $('[data-cs="bar"]');
  bar?.setAttribute('aria-valuenow', String(ids.size));
  $('[data-cs="fill"]')?.style.setProperty('--p', String(n ? ids.size / n : 0));
  setClaimText('progress', `${ids.size} of ${n} items selected`);

  setClaimText('who', user ? `${user}’s claim` : 'Your claim');
  setClaimText('count', `${ids.size} ${ids.size === 1 ? 'item' : 'items'}`);
  tweenMoney($('[data-cs="subtotal"]'), t.subtotal, initial);
  tweenMoney($('[data-cs="tax"]'), t.taxShare, initial);
  tweenMoney($('[data-cs="estimate"]'), t.estimate, initial);

  const submit = $('[data-cs="submit"]');
  if (submit) submit.disabled = !user || ids.size === 0;
  const summary = $('.claim-summary');
  if (summary) summary.dataset.ready = String(!!user && ids.size > 0);
  setClaimText('hint', !user ? 'Choose your name to continue.' : ids.size === 0 ? 'Select at least one item you shared.' : 'Ready. This prepares a message for your host.');

  if (!initial) {
    // Any change after a message was prepared makes that message stale, so never leave it showing as done.
    const box = $('#claim-result-box');
    if (box?.firstElementChild) box.replaceChildren();
    writeStore(claimDraftKey(p), { user, participantId, ids: [...ids] });
  }
}

// One delegated listener for the whole page; no per-render listeners to leak or double-fire.
document.addEventListener('change', e => {
  if (e.target.matches?.('[data-claim-item], input[data-claimant]') && $('.claim-page')) syncClaim();
});
