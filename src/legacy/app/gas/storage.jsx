import { uid } from '../../state.jsx';
import { createForm as gasCreateForm } from '../../form-bridge.jsx';
import { FORM_BRIDGE_OWNER_KEY, FORM_BRIDGE_FORM_ID_KEY } from '../../../config/formBridge.jsx';

export const gasResponseCache = new Map();

export const gasResponseUpdatedAt = new Map();

export const gasBillMetaKey = billId => `splitsmart:gas:bill:${billId}`;

export const gasResponsesStorageKey = formId => `splitsmart:gas:responses:${formId}`;

export const claimLinksStorageKey = formId => `splitsmart:claim-links:${formId}`;

export function readSavedGasResponses(formId) {
  if (!formId) return { rows: [], updatedAt: null };
  try {
    const saved = JSON.parse(localStorage.getItem(gasResponsesStorageKey(formId)) || 'null');
    return saved && Array.isArray(saved.rows) ? saved : { rows: [], updatedAt: null };
  } catch { return { rows: [], updatedAt: null }; }
}

export function saveGasResponsesSnapshot(formId, rows, updatedAt) {
  if (!formId) return;
  localStorage.setItem(gasResponsesStorageKey(formId), JSON.stringify({ rows, updatedAt }));
}

export function readSavedClaimLinks(formId) {
  if (!formId) return null;
  try { return JSON.parse(localStorage.getItem(claimLinksStorageKey(formId)) || 'null'); }
  catch { return null; }
}

export function saveClaimLinks(formId, links) {
  if (!formId) return;
  localStorage.setItem(claimLinksStorageKey(formId), JSON.stringify({ ...links, savedAt: new Date().toISOString() }));
}

export function readGasBillMeta(bill) {
  if (!bill?.id) return null;
  try { return JSON.parse(localStorage.getItem(gasBillMetaKey(bill.id)) || 'null'); }
  catch { return null; }
}

export function saveGasBillMeta(bill, meta) {
  if (!bill?.id) return;
  localStorage.setItem(gasBillMetaKey(bill.id), JSON.stringify(meta));
}

export async function ensureGasFormForBill(bill, payload, { reuseSaved = false } = {}) {
  let meta = readGasBillMeta(bill) || {};
  if (!meta.formId) meta.formId = uid('FORM');
  if (reuseSaved && meta.formId && meta.ownerKey) return meta;
  saveGasBillMeta(bill, meta);

  const form = await gasCreateForm({
    formId: meta.formId,
    title: `SplitSmart claim — ${bill.restaurantName || 'Shared bill'}`,
    description: `Submit the items you shared for ${bill.restaurantName || 'this shared bill'}.`,
    fields: ['Customer name', 'Participant ID', 'Link type', 'Contact details', 'Claimed items', 'Claimed item details', 'Estimated amount', 'Additional note'],
    participants: payload.participantRecords
  });
  if (!form?.ownerKey || form.formId !== meta.formId) {
    throw new Error('Apps Script did not preserve this bill’s form ID and owner mapping.');
  }
  meta = {
    ...meta,
    formId: form.formId,
    ownerKey: form.ownerKey,
    claimRound: Number(form.claimRound) || Number(meta.claimRound) || 1,
    acceptingClaims: form.acceptingClaims !== false
  };
  saveGasBillMeta(bill, meta);
  localStorage.setItem(FORM_BRIDGE_OWNER_KEY, form.ownerKey);
  localStorage.setItem(FORM_BRIDGE_FORM_ID_KEY, form.formId);
  return meta;
}

export function copyTextWithFallback(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const fallback = document.createElement('textarea');
  fallback.value = text;
  fallback.setAttribute('readonly', '');
  fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.appendChild(fallback);
  fallback.select();
  const copied = document.execCommand('copy');
  fallback.remove();
  return copied ? Promise.resolve() : Promise.reject(new Error('Clipboard access was unavailable.'));
}
