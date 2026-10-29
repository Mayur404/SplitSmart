/** Receipt upload validation, Gemini scanning, and safe bill import. */
export function createReceiptController(deps) {
  const { $, toast, validateFileInput, geminiConfigured, go, settings, scanReceipt, currentBill, uid, toPaise, renderBill, esc } = deps;

  async function handleReceiptScan() {
    const fileInput = $('#receipt-upload');
    const file = fileInput?.files?.[0];
    if (!file) {
      const message = 'Choose a receipt image before scanning.';
      if (fileInput) fileInput.setAttribute('aria-invalid', 'true');
      const fileStatus = $('#receipt-file-status');
      if (fileStatus) fileStatus.innerHTML = `<div class="receipt-upload-error" role="alert">${esc(message)}</div>`;
      toast('Please select or capture a receipt image first.', true);
      return;
    }
    if (!validateFileInput(fileInput, 'image')) {
      toast('Please select a valid receipt image (15 MB or smaller).', true);
      return;
    }

    if (!geminiConfigured) {
      toast('Gemini is not configured. Add VITE_GEMINI_API_KEY to your .env file and restart Vite.', true);
      go('settings');
      return;
    }

    const btn = $('#scan-btn');
    const spinner = $('#scan-spinner');
    const statusBox = $('#scan-status');

    if (btn) btn.disabled = true;
    if (spinner) spinner.style.display = 'inline';
    if (statusBox) statusBox.innerHTML = '<span class="quiet">Compressing image in your browser…</span>';

    try {
      const onProgress = (msg) => {
        if (statusBox) statusBox.innerHTML = `<span class="quiet">${esc(msg)}</span>`;
      };

      const receipt = await scanReceipt(file, settings.selectedModel || 'auto', onProgress);
      const b = currentBill();
      if (b) {
        b.restaurantName = receipt.restaurantName;
        b.tax = { ...receipt.tax };
        b.discount = receipt.discount;
        b.statedTotal = receipt.statedGrandTotal;
        b.items = receipt.items.map((it) => ({
          id: uid('item'),
          name: it.name,
          quantity: it.quantity,
          unitPaise: toPaise(it.unitPrice),
          totalPaise: Math.round(toPaise(it.unitPrice) * it.quantity),
          category: it.category,
          assignments: [],
        }));
        toast(
          `Receipt scanned successfully using ${receipt.modelUsed || 'Gemini'}! Review extracted items.`,
        );
        renderBill();
      }
    } catch (err) {
      const errorMessage = err?.message || 'Unable to scan this image. Please try another image.';

      if (err?.code === 'NOT_A_BILL') {
        const alertMessage = `${errorMessage} You can also enter items manually.`;
        if (statusBox) {
          statusBox.innerHTML = `<div class="warning" role="alert"><strong>Bill not detected.</strong> ${esc(alertMessage)}</div>`;
        }
        // Show a visible toast alert as well as the inline message beside the uploader.
        toast(errorMessage, true);
      } else if (statusBox) {
        statusBox.innerHTML = `<div class="warning" role="alert">⚠️ ${esc(errorMessage)} You can also enter items manually.</div>`;
        toast(errorMessage, true);
      }
    } finally {
      if (btn) btn.disabled = false;
      if (spinner) spinner.style.display = 'none';
    }
  }

  return { handleReceiptScan };
}
