/** SplitSmart — Share-claims modal. */
import { makeSharePayload, encodeShare, encodePersonalShare } from '../../share.jsx';
import { resetClaims as gasResetClaims } from '../../form-bridge.jsx';
import { currentBill, esc, members, toast } from '../core.jsx';
import { renderGasResponses } from './responses.jsx';
import { addFormIdToClaimUrl } from './share.jsx';
import { claimLinksStorageKey, copyTextWithFallback, ensureGasFormForBill, gasResponseCache, gasResponseUpdatedAt, gasResponsesStorageKey, readSavedClaimLinks, saveClaimLinks, saveGasBillMeta } from './storage.jsx';
import { saveCurrentOutingToRecent } from '../outing.jsx';

let shareClaimsKeyHandler = null;

export function closeShareClaimsModal(immediate = false) {
  const overlay = document.getElementById('share-claims-overlay');
  if (shareClaimsKeyHandler) {
    document.removeEventListener('keydown', shareClaimsKeyHandler);
    shareClaimsKeyHandler = null;
  }
  if (!overlay) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (immediate === true || reduceMotion || overlay.classList.contains('is-closing')) {
    overlay.remove();
    return;
  }
  // Reverse the entrance transition, then remove the overlay.
  overlay.classList.add('is-closing');
  const remove = () => overlay.remove();
  overlay.addEventListener('animationend', event => { if (event.target === overlay) remove(); }, { once: true });
  setTimeout(remove, 320);
}

export function openShareClaimsModal() {
  const bill = currentBill();
  if (!bill?.items?.length) {
    toast('Add items before sharing claims.', true);
    return;
  }
  closeShareClaimsModal(true);
  const overlay = document.createElement('div');
  overlay.id = 'share-claims-overlay';
  overlay.className = 'share-claims-overlay';
  overlay.innerHTML = `
    <section class="share-claims-modal" role="dialog" aria-modal="true" aria-labelledby="share-claims-title">
      <header class="share-claims-header">
        <div class="share-claims-titles"><p class="share-claims-kicker">${esc(bill.restaurantName || 'Shared bill')}</p><h2 id="share-claims-title">Personal Claims</h2></div>
        <button type="button" class="share-claims-close" aria-label="Close Personal Claims"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </header>
      <div class="share-claims-body" aria-live="polite"><div class="share-claims-loading"><span class="sc-spinner" aria-hidden="true"></span>Preparing personal links…</div></div>
    </section>`;
  document.body.appendChild(overlay);
  const closeBtn = overlay.querySelector('.share-claims-close');
  closeBtn.addEventListener('click', () => closeShareClaimsModal());
  overlay.addEventListener('click', event => { if (event.target === overlay) closeShareClaimsModal(); });
  shareClaimsKeyHandler = event => { if (event.key === 'Escape') closeShareClaimsModal(); };
  document.addEventListener('keydown', shareClaimsKeyHandler);
  closeBtn.focus({ preventScroll: true });
  overlay.querySelector('.share-claims-modal').addEventListener('click', event => event.stopPropagation());
  prepareShareClaims(overlay, bill);
}

export async function prepareShareClaims(overlay, bill) {
  const body = overlay.querySelector('.share-claims-body');
  try {
    const payload = makeSharePayload(bill, members(), bill.items);
    // Resolve the Apps Script form once. The old implementation called
    // ensureGasFormForBill once per participant, serializing identical network
    // requests before any links could be rendered.
    const meta = await ensureGasFormForBill(bill, payload, { reuseSaved: true });
    if (meta.acceptingClaims === false) throw new Error('Customer submissions are closed. Reopen them before generating personal links.');
    const payloadSnapshot = JSON.stringify(payload);
    let savedLinks = readSavedClaimLinks(meta.formId);
    const linksAreCurrent = savedLinks &&
      savedLinks.payloadSnapshot === payloadSnapshot &&
      Number(savedLinks.claimRound) === Number(meta.claimRound) &&
      typeof savedLinks.commonLink === 'string';
    if (!linksAreCurrent) {
      savedLinks = {
        payloadSnapshot,
        claimRound: meta.claimRound,
        commonLink: addFormIdToClaimUrl(encodeShare(payload), meta.formId, meta.claimRound),
        personalLinks: {}
      };
    }
    const links = payload.participantRecords.map(person => ({
      person,
      link: savedLinks.personalLinks?.[person.id] || addFormIdToClaimUrl(encodePersonalShare(payload, person), meta.formId, meta.claimRound)
    }));
    savedLinks.personalLinks = Object.fromEntries(links.map(({ person, link }) => [person.id, link]));
    saveClaimLinks(meta.formId, savedLinks);
    if (!document.body.contains(overlay)) return;
    body.replaceChildren();
    const list = document.createElement('div');
    list.className = 'share-claims-list';
    links.forEach(({ person, link }) => {
      const card = document.createElement('article');
      card.className = 'share-claim-person';
      const message = `Hey ${person.name}! Your ${bill.restaurantName || 'bill'} is ready to split on SplitSmart.\n\nPlease open your personal claim link and select the items you had:\n\n${link}\n\nThis link is assigned specifically to you and this bill. Please do not share it with others.\n\nHappy splitting!`;
      const initial = esc((person.name || '?').trim().charAt(0).toUpperCase() || '?');
      card.innerHTML = `<div class="share-claim-head"><span class="share-claim-avatar" aria-hidden="true">${initial}</span><div class="share-claim-person-name">${esc(person.name)}</div></div><div class="share-claim-actions"><button type="button" class="share-btn share-copy" aria-label="Copy ${esc(person.name)} claim link"><svg class="share-btn-icon share-icon-copy" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg><svg class="share-btn-icon share-icon-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg><span class="share-copy-label">Copy link</span></button><a class="share-btn share-whatsapp" aria-label="Send ${esc(person.name)} claim link on WhatsApp" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(message)}"><svg class="whatsapp-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 3.5A11.8 11.8 0 0 0 12.1 0C5.6 0 .3 5.3.3 11.8c0 2.1.6 4.1 1.6 5.8L.2 24l6.6-1.7a11.8 11.8 0 0 0 5.3 1.3h.1c6.5 0 11.8-5.3 11.8-11.8 0-3.1-1.2-6.1-3.5-8.3Zm-8.4 18.1h-.1c-1.7 0-3.4-.5-4.8-1.3l-.3-.2-3.9 1 1-3.8-.2-.3a9.7 9.7 0 1 1 8.3 4.6Zm5.3-7.3c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-1.6-.8-2.6-1.4-3.7-3.2-.3-.5.3-.5.8-1.6.1-.2.1-.4 0-.6l-.9-2.1c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.2-1.2 2.9s1.2 3.4 1.4 3.6c.2.2 2.4 3.7 5.8 5.2 2.2 1 2.2.7 2.6.7.4 0 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.2-.3-.2-.5-.3Z"/></svg><span>WhatsApp</span></a></div><span class="share-sr-status" role="status" aria-live="polite"></span>`;
      const copy = card.querySelector('.share-copy');
      const copyLabel = copy.querySelector('.share-copy-label');
      const copyStatus = card.querySelector('.share-sr-status');
      let copyTimer = null;
      copy.addEventListener('click', async () => {
        try {
          await copyTextWithFallback(link);
          copy.classList.add('is-copied');
          copyLabel.textContent = 'Copied';
          copyStatus.textContent = `${person.name} link copied`;
          clearTimeout(copyTimer);
          copyTimer = setTimeout(() => {
            if (!copy.isConnected) return;
            copy.classList.remove('is-copied');
            copyLabel.textContent = 'Copy link';
            copyStatus.textContent = '';
          }, 1600);
        } catch { toast('Could not copy the claim link. Please try again, or use the WhatsApp button.', true); }
      });
      list.appendChild(card);
    });
    body.appendChild(list);
  } catch (error) {
    body.innerHTML = `<div class="share-claims-error"><strong>Could not prepare claim links.</strong><span>${esc(error.message)}</span><button type="button" class="share-btn share-retry">Try again</button></div>`;
    body.querySelector('.share-retry').addEventListener('click', () => prepareShareClaims(overlay, bill));
  }
}

export async function startFreshClaimRound() {
  const bill = currentBill();
  if (!bill) throw new Error('No active bill is selected.');
  const payload = makeSharePayload(bill, members(), bill.items);
  const meta = await ensureGasFormForBill(bill, payload);
  const reset = await gasResetClaims(meta.ownerKey, meta.formId, meta.claimRound);
  meta.claimRound = Number(reset.claimRound) || (meta.claimRound + 1);
  meta.acceptingClaims = true;
  saveGasBillMeta(bill, meta);
  localStorage.removeItem(claimLinksStorageKey(meta.formId));
  localStorage.removeItem(gasResponsesStorageKey(meta.formId));
  localStorage.removeItem(`splitsmart-gas-auto-claims:${bill.id}`);
  gasResponseCache.set(bill.id, []);
  gasResponseUpdatedAt.delete(bill.id);
  bill.items.forEach(item => { item.assignments = []; });
  saveCurrentOutingToRecent();
  renderGasResponses([], { updatedAt: null });
  toast('Old claims cleared. A fresh claim round is ready.');
  return meta;
}
