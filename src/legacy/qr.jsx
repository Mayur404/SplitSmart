/**
 * SplitSmart — qr.js
 * NPCI UPI URI Generation, QR Rendering, Payment Deep Links, and Split-Payment Warnings.
 */

/**
 * Validate standard UPI Virtual Payment Address (VPA) / UPI ID.
 * Format: username@bankhandle (e.g. name@okhdfcbank, 9876543210@paytm)
 */
export function isValidUpiId(upiId) {
  if (!upiId || typeof upiId !== 'string') return false;
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/.test(upiId.trim());
}

/**
 * Generate standard NPCI UPI payment deep link.
 * Format: upi://pay?pa=...&pn=...&am=...&cu=INR&tn=...
 */
export function paymentUri({ upiId, name, amountPaise, note = 'SplitSmart settlement' }) {
  if (!isValidUpiId(upiId)) {
    throw new Error(
      'Please configure a valid UPI ID (e.g., name@okhdfcbank) to create a payment link.',
    );
  }
  const paise = Math.trunc(Number(amountPaise) || 0);
  if (paise <= 0) {
    throw new Error('Payment amount must be greater than ₹0.00.');
  }

  const cleanName = String(name || 'SplitSmart Payee')
    .trim()
    .slice(0, 70);
  const cleanNote = String(note || 'Settlement')
    .trim()
    .slice(0, 80);
  const amountRupees = (paise / 100).toFixed(2);

  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: cleanName,
    am: amountRupees,
    cu: 'INR',
    tn: cleanNote,
  });

  return `upi://pay?${params.toString()}`;
}

/**
 * Render QR code using QRCode.js library.
 * Cleans the container first and handles CDN unavailability gracefully.
 */
export function renderQR(container, uri, size = 180) {
  if (!container) return false;
  container.replaceChildren();

  if (typeof window.QRCode !== 'function') {
    // Try to dynamically load fallback script if not yet present
    if (typeof document !== 'undefined' && !document.querySelector('script[data-qr-fallback]')) {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js';
      s.dataset.qrFallback = '1';
      s.onload = () => {
        if (typeof window.QRCode === 'function') {
          renderQR(container, uri, size);
        }
      };
      document.head.appendChild(s);
    }

    const fallback = document.createElement('div');
    fallback.className = 'qr-fallback-msg';
    fallback.innerHTML = `
      <p style="font-size:12px;color:var(--muted);margin:0 0 8px;">Direct UPI Payment link ready.</p>
      <a class="button button-primary button-small" href="${uri}">Open in UPI App</a>
    `;
    container.appendChild(fallback);
    return false;
  }

  try {
    new window.QRCode(container, {
      text: uri,
      width: size,
      height: size,
      colorDark:
        getComputedStyle(document.documentElement).getPropertyValue('--qr-dark').trim() ||
        '#133527',
      colorLight:
        getComputedStyle(document.documentElement).getPropertyValue('--qr-light').trim() ||
        '#ffffff',
      correctLevel: window.QRCode.CorrectLevel?.M ?? 1,
    });
    return true;
  } catch {
    container.textContent = 'Could not generate QR code image.';
    return false;
  }
}

/**
 * Split a large payment amount (e.g. > ₹2,000 threshold) into smaller equal instructions.
 * Residual paise are distributed to the first part so that:
 * sum(parts) === amountPaise exactly.
 */
export function splitPayment(amountPaise, partsCount = 2) {
  const tot = Math.trunc(Number(amountPaise) || 0);
  const n = Math.max(2, Math.trunc(Number(partsCount) || 2));
  const base = Math.floor(tot / n);
  const remainder = tot % n;

  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}
