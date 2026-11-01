/** SplitSmart — Claim link sharing, WhatsApp claims and claim import. */
import { uid, write as writeStore } from '../../state.jsx';
import { formatCurrency } from '../../algorithm.jsx';
import { makeSharePayload, encodeShare, claimMessage, parseClaim, whatsappUrl } from '../../share.jsx';
import { createForm as gasCreateForm, submitResponse as gasSubmitResponse, resetClaims as gasResetClaims } from '../../form-bridge.jsx';
import { FORM_BRIDGE_OWNER_KEY, FORM_BRIDGE_OWNER_KEYS_KEY, FORM_BRIDGE_FORM_ID_KEY } from '../../../config/formBridge.jsx';
import { $, S, currentBill, esc, members, toast } from '../core.jsx';
import { renderGasResponses, applyGasClaimsToAssignments } from './responses.jsx';
import { saveCurrentOutingToRecent } from '../outing.jsx';
import { gasResponseCache, gasResponseUpdatedAt, readGasBillMeta, readSavedClaimLinks, readSavedGasResponses, saveClaimLinks, saveGasBillMeta, saveGasResponsesSnapshot } from './storage.jsx';
import { go } from '../router.jsx';
import { claimDraftKey, claimMotionOk, claimTotals, readClaimState } from '../views/claim.jsx';

export function addFormIdToClaimUrl(baseLink, formId, claimRound = 1) {
  const url = new URL(baseLink);
  url.searchParams.set('formId', formId);
  url.searchParams.set('claimRound', String(Number(claimRound) || 1));
  return url.toString();
}

export async function shareClaimUrl() {
  const bill = currentBill();
  if (!bill || !bill.items.length) {
    toast('Add items before sharing.', true);
    return;
  }

  try {
    const billMembers = members();
    const payload = makeSharePayload(bill, billMembers, bill.items);
    const commonBaseLink = encodeShare(payload);
    const meta = readGasBillMeta(bill) || { formId: uid('FORM') };
    if (!meta.formId) meta.formId = uid('FORM');

    // Persist the generated ID before the network call so retries reuse the same bill/form mapping.
    saveGasBillMeta(bill, meta);
    toast('Preparing this bill’s claim form…');

    const form = await gasCreateForm({
      formId: meta.formId,
      title: `SplitSmart claim — ${bill.restaurantName || 'Shared bill'}`,
      description: `Submit the items you shared for ${bill.restaurantName || 'this shared bill'}.`,
      fields: ['Customer name', 'Participant ID', 'Link type', 'Contact details', 'Claimed items', 'Claimed item details', 'Estimated amount', 'Additional note'],
      participants: payload.participantRecords
    });

    if (!form?.ownerKey || !form?.formId || form.formId !== meta.formId) {
      throw new Error('Apps Script did not preserve this bill’s form ID and owner mapping.');
    }

    meta.formId = form.formId;
    meta.ownerKey = form.ownerKey;
    meta.claimRound = Number(form.claimRound) || Number(meta.claimRound) || 1;
    saveGasBillMeta(bill, meta);

    // Keep legacy convenience keys, while bill-specific metadata remains authoritative.
    localStorage.setItem(FORM_BRIDGE_OWNER_KEY, form.ownerKey);
    localStorage.setItem(FORM_BRIDGE_FORM_ID_KEY, form.formId);
    const savedOwnerKeys = (() => {
      try { return JSON.parse(localStorage.getItem(FORM_BRIDGE_OWNER_KEYS_KEY) || '[]'); }
      catch { return []; }
    })();
    if (!savedOwnerKeys.includes(form.ownerKey)) savedOwnerKeys.push(form.ownerKey);
    localStorage.setItem(FORM_BRIDGE_OWNER_KEYS_KEY, JSON.stringify(savedOwnerKeys));

    const payloadSnapshot = JSON.stringify(payload);
    let savedLinks = readSavedClaimLinks(form.formId);
    const linksAreCurrent = savedLinks &&
      savedLinks.payloadSnapshot === payloadSnapshot &&
      Number(savedLinks.claimRound) === meta.claimRound &&
      typeof savedLinks.commonLink === 'string';
    if (!linksAreCurrent) {
      savedLinks = {
        payloadSnapshot,
        claimRound: meta.claimRound,
        commonLink: addFormIdToClaimUrl(commonBaseLink, form.formId, meta.claimRound),
      };
      saveClaimLinks(form.formId, savedLinks);
    }
    const commonLink = savedLinks.commonLink;

    // The top-level Share claim link action is a quick-copy action.
    // Do not open the legacy floating Share Bill for Claims dialog/window.
    try {
      await navigator.clipboard.writeText(commonLink);
      toast('Common claim link copied. No new window was opened.');
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = commonLink;
      fallback.setAttribute('readonly', '');
      fallback.style.position = 'fixed';
      fallback.style.opacity = '0';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (copied) {
        toast('Common claim link copied. No new window was opened.');
      } else {
        window.prompt('Copy your common claim link:', commonLink);
      }
    }

    // Keep the cached responses for this bill available in Step 2.
    const savedSnapshot = readSavedGasResponses(form.formId);
    gasResponseCache.set(bill.id, savedSnapshot.rows);
    if (savedSnapshot.updatedAt) {
      gasResponseUpdatedAt.set(bill.id, savedSnapshot.updatedAt);
    }
    if (S.view === 'assign') {
      renderGasResponses(
        savedSnapshot.rows,
        { updatedAt: savedSnapshot.updatedAt || null }
      );
    }
  } catch (error) {
    toast(error.message || 'Could not create the claim links.', true);
    console.error('SplitSmart claim link generation failed:', error);
  }
}

/**
 * Start a fresh common-claim round. Existing submissions for this bill are
 * cleared in Sheets, the round number advances, and a new common link is copied.
 */
export async function getNewCommonClaimLink() {
  const bill = currentBill();
  if (!bill || !bill.items?.length) {
    toast('Add items before creating a new claim link.', true);
    return;
  }

  const meta = readGasBillMeta(bill);
  if (!meta?.ownerKey || !meta?.formId) {
    toast('Create the first common claim link before requesting a new one.', true);
    return;
  }

  const confirmed = window.confirm(
    'Create a new common claim link? Previous customer claims for this bill will be cleared, and participants must submit again.'
  );
  if (!confirmed) return;

  try {
    toast('Preparing a fresh common claim link…');
    const reset = await gasResetClaims(meta.ownerKey, meta.formId, Number(meta.claimRound) || 1);
    meta.claimRound = Number(reset.claimRound) || (Number(meta.claimRound) || 1) + 1;
    meta.acceptingClaims = true;
    saveGasBillMeta(bill, meta);

    const payload = makeSharePayload(bill, members(), bill.items);
    const commonLink = addFormIdToClaimUrl(encodeShare(payload), meta.formId, meta.claimRound);
    const savedLinks = {
      payloadSnapshot: JSON.stringify(payload),
      claimRound: meta.claimRound,
      commonLink
    };
    saveClaimLinks(meta.formId, savedLinks);

    // Clear stale response snapshots and undo only assignments previously
    // synchronized from customer claims; manual assignments remain untouched.
    gasResponseCache.set(bill.id, []);
    const syncedAt = new Date().toISOString();
    gasResponseUpdatedAt.set(bill.id, syncedAt);
    saveGasResponsesSnapshot(meta.formId, [], syncedAt);
    const changed = applyGasClaimsToAssignments([]);
    if (changed) saveCurrentOutingToRecent();

    try {
      await navigator.clipboard.writeText(commonLink);
      toast('New common claim link copied. Previous claims were cleared.');
    } catch {
      const fallback = document.createElement('textarea');
      fallback.value = commonLink;
      fallback.setAttribute('readonly', '');
      fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(fallback);
      fallback.select();
      const copied = document.execCommand('copy');
      fallback.remove();
      if (copied) toast('New common claim link copied. Previous claims were cleared.');
      else window.prompt('Copy your new common claim link:', commonLink);
    }

    if (S.view === 'assign') {
      renderAssign();
      renderGasResponses([], { updatedAt: syncedAt });
    }
  } catch (error) {
    toast(error.message || 'Could not create a new common claim link.', true);
    console.error('New common claim link failed:', error);
  }
}

// Generate WhatsApp Claim from Self-Claim Page
export async function generateWhatsAppClaim() {
  if (!S.decodedClaimPayload) return;
  const { user: claimant, participantId: selectedParticipantId, ids } = readClaimState();
  if (!claimant) {
    toast('Please choose your name first.', true);
    return;
  }

  const claimedItemIds = [...ids];
  if (claimedItemIds.length === 0) {
    toast('Please select at least one item you consumed.', true);
    return;
  }

  let claimMsg, waUrl;
  try {
    claimMsg = claimMessage(S.decodedClaimPayload, claimant, claimedItemIds);
    waUrl = whatsappUrl(claimMsg);
  } catch (err) {
    toast(err.message || 'Could not prepare the claim message.', true);
    return;
  }
  writeStore(claimDraftKey(S.decodedClaimPayload), { user: claimant, participantId: selectedParticipantId, ids: claimedItemIds });

  // If this is a Google Apps Script customer link, save the claim to Sheets as well.
  const query = new URLSearchParams(window.location.search);
  const formId = query.get('formId');
  let savedToSheets = false;
  if (formId) {
    const contact = $('#gas-customer-contact')?.value?.trim() || '';
    const note = $('#gas-customer-note')?.value?.trim() || '';
    // A claimant may tick a whole item (`id`) or individual units of a multi-quantity item (`id::unit:N`).
    const selectedItems = [];
    S.decodedClaimPayload.items.forEach(item => {
      const qty = Math.max(1, Math.trunc(Number(item.quantity) || 1));
      const whole = claimedItemIds.includes(item.id);
      const units = whole
        ? Array.from({ length: qty }, (_, i) => i + 1)
        : Array.from({ length: qty }, (_, i) => i + 1).filter(n => claimedItemIds.includes(`${item.id}::unit:${n}`));
      if (!units.length) return;
      const amountPaise = Math.round((Number(item.costPaise) || 0) * units.length / qty);
      selectedItems.push({
        id: item.id,
        name: item.name,
        quantity: units.length,
        totalQuantity: qty,
        ...(units.length < qty ? { units } : {}),
        amountPaise,
        amount: formatCurrency(amountPaise)
      });
    });
    const estimate = claimTotals(S.decodedClaimPayload, new Set(claimedItemIds)).estimate;
    try {
      const participantId = selectedParticipantId || (S.decodedClaimPayload.participantRecords || []).find(person => person.name === claimant)?.id || '';
      await gasSubmitResponse(formId, Number(query.get('claimRound')) || 1, {
        'Customer name': claimant,
        'Participant ID': participantId,
        'Link type': 'common',
        'Contact details': contact,
        'Claimed items': selectedItems.map(item => item.name).join(', '),
        'Claimed item details': JSON.stringify(selectedItems),
        'Estimated amount': formatCurrency(estimate),
        'Additional note': note
      });
      savedToSheets = true;
      toast('Claim saved to the owner’s Google Sheet.');
    } catch (error) {
      console.error('Could not save claim to Google Sheets:', error);
      toast(`Claim was not submitted. Please try again: ${error.message}`, true);
      return;
    }
  }

  // Google Apps Script claims finish with a submission confirmation. Legacy/offline
  // claim links retain the existing WhatsApp workflow.
  const box = $('#claim-result-box');
  if (savedToSheets) {
    box.innerHTML = `
      <div class="claim-done">
        <div class="cd-head">
          <span class="cd-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" pathLength="1"/></svg></span>
          <div>
            <h3 tabindex="-1">Claim submitted successfully</h3>
            <p>Your selected name and items have been sent to the bill owner. You can close this page.</p>
          </div>
        </div>
      </div>
    `;
    box.scrollIntoView({ behavior: claimMotionOk() ? 'smooth' : 'auto', block: 'nearest' });
    box.querySelector('h3')?.focus({ preventScroll: true });
    return;
  }
  box.innerHTML = `
    <div class="claim-done">
      <div class="cd-head">
        <span class="cd-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" pathLength="1"/></svg></span>
        <div>
          <h3 tabindex="-1">Claim ready for ${esc(claimant)}</h3>
          <p>Send this message to your host on WhatsApp so they can add it to the bill.</p>
        </div>
      </div>
      <textarea readonly rows="3" aria-label="Claim message" onclick="this.select()">${esc(claimMsg)}</textarea>
      <a class="button button-primary cd-send" href="${esc(waUrl)}" target="_blank" rel="noopener">Open WhatsApp &amp; send to host</a>
    </div>
  `;
  box.scrollIntoView({ behavior: claimMotionOk() ? 'smooth' : 'auto', block: 'nearest' });
  box.querySelector('h3')?.focus({ preventScroll: true });
}

// Prompt Host to Import WhatsApp Claim
export function promptImportClaim() {
  const raw = prompt('Paste the full SPLITSMART_CLAIM message received from WhatsApp:');
  if (!raw || !raw.trim()) return;

  const b = currentBill();
  if (!b) return;

  try {
    const currentPayload = makeSharePayload(b, members(), b.items);
    const claim = parseClaim(raw.trim(), currentPayload, S.importedClaims);

    // Preview and confirm
    const itemNames = claim.itemIds.map(id => b.items.find(i => i.id === id)?.name || id).join(', ');
    if (confirm(`Import claim from ${claim.user} for:\n• ${itemNames}\n\nApply these assignments?`)) {
      const member = members().find(m => m.name === claim.user);
      if (member) {
        claim.itemIds.forEach(id => {
          const item = b.items.find(i => i.id === id);
          if (item) {
            item.assignments = item.assignments || [];
            if (!item.assignments.includes(member.id)) {
              item.assignments.push(member.id);
            }
          }
        });
        S.importedClaims.push(claim);
        toast(`Claim from ${claim.user} applied successfully!`);
        go('assign');
      }
    }
  } catch (err) {
    toast(err.message, true);
  }
}
