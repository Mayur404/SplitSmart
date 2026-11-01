import { $, currentBill, toast } from '../core.jsx';
import { refreshGasResponses, renderGasResponses } from '../gas/responses.jsx';
import { generateWhatsAppClaim, promptImportClaim, shareClaimUrl } from '../gas/share.jsx';
import { gasResponseCache, gasResponseUpdatedAt, readGasBillMeta, readSavedGasResponses } from '../gas/storage.jsx';
import { expandedClaimItems } from '../views/claim.jsx';

export const ACTIONS = [
  'claim-toggle-units',
  'close-share-dialog',
  'share-claim-link',
  'open-customer-claims',
  'refresh-gas-responses',
  'import-claim-modal',
  'submit-whatsapp-claim'
];

export async function handle(action, actionBtn) {
  switch (action) {
    case 'claim-toggle-units': {
      const itemId = actionBtn.dataset.itemId;
      const entry = actionBtn.closest('[data-claim-entry-id]');
      const parent = entry?.querySelector('.claim-parent-card');
      const units = entry?.querySelector('.claim-inline-units');
      if (!entry || !parent || !units) break;
      const expanded = !units.hidden;
      units.hidden = expanded;
      parent.hidden = !expanded;
      entry.classList.toggle('is-expanded', !expanded);
      expandedClaimItems[expanded ? 'delete' : 'add'](itemId);
      break;
    }

    case 'close-share-dialog': {
      $('#share-dialog')?.close();
      break;
    }

    case 'share-claim-link': {
      shareClaimUrl();
      break;
    }


    case 'open-customer-claims': {
      const bill = currentBill();
      if (!bill?.id) {
        toast('No active bill is selected. Open a bill from Recent bills first.', true);
        break;
      }
      const meta = readGasBillMeta(bill);
      const snapshot = meta?.formId ? readSavedGasResponses(meta.formId) : { rows: [], updatedAt: null };
      renderGasResponses(gasResponseCache.get(bill.id) || snapshot.rows || [], {
        updatedAt: gasResponseUpdatedAt.get(bill.id) || snapshot.updatedAt || null
      });
      requestAnimationFrame(() => $('#formbridge-live-responses')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      break;
    }

    case 'refresh-gas-responses': {
      // The live response panel is rendered on the main app view, not inside the modal.
      const shareDialog = $('#share-dialog');
      if (shareDialog?.open) shareDialog.close();
      refreshGasResponses();
      break;
    }

    case 'import-claim-modal': {
      promptImportClaim();
      break;
    }

    case 'submit-whatsapp-claim': {
      generateWhatsAppClaim();
      break;
    }
  }
}
