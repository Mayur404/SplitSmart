import { makeSharePayload, encodeShare, claimMessage, parseClaim, whatsappUrl } from '../../share.jsx';

/** Stateless claim URL sharing, WhatsApp claim generation, and host-side import. */
export function createClaimsController(deps) {
  const {
    $,
    $$,
    currentBill,
    members,
    toast,
    esc,
    validateFields,
    setFieldValidationError,
    clearFieldValidation,
    getDecodedClaimPayload,
    importedClaims,
    go,
  } = deps;

  function shareClaimUrl() {
    const b = currentBill();
    if (!b || !b.items.length) {
      toast('Add items before sharing.', true);
      return;
    }

    try {
      const payload = makeSharePayload(b, members(), b.items);
      const link = encodeShare(payload);

      // Populate and display share modal dialog
      const dlg = $('#share-dialog');
      if (dlg) {
        $('#share-dialog-link').value = link;
        $('#share-dialog-open-btn').href = link;
        $('#share-dialog-wa-btn').href =
          `https://api.whatsapp.com/send?text=${encodeURIComponent(`Hey! Here is the SplitSmart bill for ${b.restaurantName || 'our outing'}. Please select the items you ordered: ` + link)}`;

        const copyBtn = $('#share-dialog-copy-btn');
        if (copyBtn) {
          copyBtn.textContent = 'Copy Link';
          copyBtn.onclick = () => {
            if (navigator.clipboard) {
              navigator.clipboard
                .writeText(link)
                .then(() => {
                  copyBtn.textContent = 'Copied!';
                  toast('Link copied to clipboard!');
                  setTimeout(() => {
                    copyBtn.textContent = 'Copy Link';
                  }, 2000);
                })
                .catch(() => {
                  $('#share-dialog-link').select();
                  document.execCommand('copy');
                  copyBtn.textContent = 'Copied!';
                });
            } else {
              $('#share-dialog-link').select();
              document.execCommand('copy');
              copyBtn.textContent = 'Copied!';
            }
          };
        }
        dlg.showModal();
      }

      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(link)
          .then(() => toast('Stateless self-claim link copied to clipboard!'))
          .catch(() => {});
      }
    } catch (err) {
      toast(err.message, true);
    }
  }

  function generateWhatsAppClaim() {
    const decodedClaimPayload = getDecodedClaimPayload();
    if (!decodedClaimPayload) return;
    if (!validateFields($('#legacy-react-root'))) return;
    const claimant = $('#claimant-name-select')?.value;

    const checkedBoxes = $$('[data-claim-item]:checked');
    const claimedItemIds = Array.from(checkedBoxes).map((b) => b.dataset.claimItem);

    if (claimedItemIds.length === 0) {
      setFieldValidationError($('#claim-items-list'), 'Select at least one item you consumed.');
      toast('Please select at least one item you consumed.', true);
      return;
    }
    clearFieldValidation($('#claim-items-list'));

    const claimMsg = claimMessage(decodedClaimPayload, claimant, claimedItemIds);
    const waUrl = whatsappUrl(claimMsg);

    $('#claim-result-box').innerHTML = `
      <div class="success" style="margin-bottom:14px;">
        Claim prepared for <strong>${esc(claimant)}</strong>! Send this message to your outing host on WhatsApp.
      </div>
      <textarea readonly style="font-family:var(--font-mono);font-size:12px;margin-bottom:12px;" rows="3">${esc(claimMsg)}</textarea>
      <a class="button button-primary" href="${esc(waUrl)}" target="_blank" rel="noopener" style="width:100%;">
        Open WhatsApp &amp; Send to Host
      </a>
    `;
  }

  function promptImportClaim() {
    const raw = prompt('Paste the full SPLITSMART_CLAIM message received from WhatsApp:');
    if (!raw || !raw.trim()) return;

    const b = currentBill();
    if (!b) return;

    try {
      const currentPayload = makeSharePayload(b, members(), b.items);
      const claim = parseClaim(raw.trim(), currentPayload, importedClaims);

      // Preview and confirm
      const itemNames = claim.itemIds
        .map((id) => b.items.find((i) => i.id === id)?.name || id)
        .join(', ');
      if (
        confirm(`Import claim from ${claim.user} for:\n• ${itemNames}\n\nApply these assignments?`)
      ) {
        const member = members().find((m) => m.name === claim.user);
        if (member) {
          claim.itemIds.forEach((id) => {
            const item = b.items.find((i) => i.id === id);
            if (item) {
              item.assignments = item.assignments || [];
              if (!item.assignments.includes(member.id)) {
                item.assignments.push(member.id);
              }
            }
          });
          importedClaims.push(claim);
          toast(`Claim from ${claim.user} applied successfully!`);
          go('assign');
        }
      }
    } catch (err) {
      toast(err.message, true);
    }
  }

  return { shareClaimUrl, generateWhatsAppClaim, promptImportClaim };
}
