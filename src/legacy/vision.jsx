import { GEMINI_API_KEY } from '../config/gemini.jsx';
import { getReceiptFileError } from '../config/formBridge.jsx';

/**
 * SplitSmart — vision.js
 * Client-Side Image Resizing, JPEG Compression, Multi-Model Gemini Receipt Extraction, and JSON Validation.
 */

export const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.5-flash-lite',
  'gemini-1.5-flash-latest',
];

/**
 * Resize and compress receipt image to max 1024px dimension at 0.8 quality.
 * Returns { data: base64String, mimeType: 'image/jpeg' }.
 */
export async function compressImage(file) {
  const fileError = getReceiptFileError(file);
  if (fileError) throw new Error(fileError);

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = new Image();
    // Attach handlers before assigning src so fast local files cannot race the listener.
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(
        new Error(
          'This image could not be decoded by your browser. Convert HEIC to JPG or upload a JPG, PNG or WEBP image.',
        ),
      );
      img.src = objectUrl;
    });

    const maxDim = 1024;
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    if (!width || !height) {
      throw new Error('Unable to determine image dimensions.');
    }

    const scale = Math.min(1, maxDim / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is not available.');
    }

    // High quality downscaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob compression failed.'))),
        'image/jpeg',
        0.8,
      );
    });

    const base64 = await blobToBase64(blob);
    return {
      data: base64,
      mimeType: 'image/jpeg',
      originalWidth: width,
      originalHeight: height,
      scaledWidth: targetWidth,
      scaledHeight: targetHeight,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Convert Blob to Base64 string without data URI prefix.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('Failed to read compressed image blob.'));
    reader.readAsDataURL(blob);
  });
}

export const NON_BILL_IMAGE_MESSAGE =
  "This image doesn't appear to contain a bill or receipt. Please upload a clear photo of a restaurant bill.";

/** Create a recognizable error so the controller can show a specific alert. */
function createNonBillImageError(message = NON_BILL_IMAGE_MESSAGE) {
  const error = new Error(message);
  error.code = 'NOT_A_BILL';
  return error;
}

/**
 * Validate and sanitize extracted receipt data.
 * The image classifier must explicitly confirm a bill before any extracted data is used.
 * Recalculates item totals and checks for discrepancies against the stated grand total.
 */
export function validateReceipt(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('AI output is not a valid JSON object.');
  }

  // Fail closed: never import guessed items unless the vision model identifies a bill.
  if (raw.isBillReceipt !== true) {
    throw createNonBillImageError(
      typeof raw.nonBillReason === 'string' && raw.nonBillReason.trim()
        ? `${NON_BILL_IMAGE_MESSAGE} Detected content: ${raw.nonBillReason.trim().slice(0, 160)}`
        : NON_BILL_IMAGE_MESSAGE,
    );
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw createNonBillImageError(
      'No purchased items could be identified. Please upload a clear, itemized restaurant bill.',
    );
  }

  // A restaurant bill should contain at least one priced line item. This helps reject
  // unrelated photos or model responses that only guess product names.
  const hasPricedLineItem = raw.items.some((item) => {
    if (!item || typeof item !== 'object') return false;
    const unitPrice = Number(item.unitPrice);
    const totalPrice = Number(item.totalPrice);
    return (
      (Number.isFinite(unitPrice) && unitPrice > 0) ||
      (Number.isFinite(totalPrice) && totalPrice > 0)
    );
  });

  if (!hasPricedLineItem) {
    throw createNonBillImageError(
      'No priced items could be read from this image. Please upload a clear photo of the bill.',
    );
  }

  const parseMoney = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 10000000) {
      return 0;
    }
    return Math.round((n + Number.EPSILON) * 100) / 100;
  };

  const items = raw.items.slice(0, 100).map((it, idx) => {
    const name =
      typeof it.name === 'string' && it.name.trim()
        ? it.name.trim().slice(0, 80)
        : `Item ${idx + 1}`;
    let qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.round(qty * 100) / 100;

    let unitPrice = parseMoney(it.unitPrice);
    let totalPrice = parseMoney(it.totalPrice);

    if (unitPrice === 0 && totalPrice > 0) {
      unitPrice = Math.round((totalPrice / qty) * 100) / 100;
    } else if (totalPrice === 0 && unitPrice > 0) {
      totalPrice = Math.round(unitPrice * qty * 100) / 100;
    }

    const category = ['VEG', 'NON-VEG', 'ANY'].includes(it.category) ? it.category : 'ANY';

    return {
      id: `receipt-item-${idx + 1}`,
      name,
      quantity: qty,
      unitPrice,
      totalPrice,
      category,
    };
  });

  const tax = raw.tax || {};
  const cgst = parseMoney(tax.cgst);
  const sgst = parseMoney(tax.sgst);
  const serviceCharge = parseMoney(tax.serviceCharge);
  const discount = parseMoney(raw.discount);

  // Recalculate totals in JavaScript (never trust AI calculations)
  const calculatedFoodSubtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);
  const calculatedGrandTotal = Math.max(
    0,
    Math.round((calculatedFoodSubtotal + cgst + sgst + serviceCharge - discount) * 100) / 100,
  );

  const statedGrandTotal =
    raw.grandTotal != null && Number.isFinite(Number(raw.grandTotal))
      ? parseMoney(raw.grandTotal)
      : calculatedGrandTotal;

  const hasDiscrepancy = Math.abs(statedGrandTotal - calculatedGrandTotal) > 0.05;

  return {
    restaurantName:
      typeof raw.restaurantName === 'string' && raw.restaurantName.trim()
        ? raw.restaurantName.trim().slice(0, 80)
        : 'Scanned Receipt',
    items,
    tax: {
      cgst,
      sgst,
      serviceCharge,
    },
    discount,
    calculatedGrandTotal,
    statedGrandTotal,
    hasDiscrepancy,
    discrepancyAmount: Math.round((statedGrandTotal - calculatedGrandTotal) * 100) / 100,
  };
}

/**
 * Query the models.list endpoint to get all models available on the configured API key.
 */
export async function listAvailableModels() {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Add VITE_GEMINI_API_KEY to your .env file and restart Vite.');
  }
  const cleanKey = GEMINI_API_KEY;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    const errBody = await response.json().catch(() => null);
    const detail = errBody?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Failed to list models: ${detail}`);
  }
  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .filter(
      (m) =>
        Array.isArray(m.supportedGenerationMethods) &&
        m.supportedGenerationMethods.includes('generateContent'),
    )
    .map((m) => m.name.replace(/^models\//, ''));
}

/**
 * Scan receipt with automatic model fallback cascade.
 * Tries the preferred model (gemini-2.5-flash by default).
 * If Google returns 404 (model not found / restricted for the configured API key),
 * automatically cascades through alternative models (gemini-2.0-flash, gemini-1.5-flash, etc.)
 */
export async function scanReceipt(file, preferredModel = 'auto', onProgress = null) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Add VITE_GEMINI_API_KEY to your .env file and restart Vite.');
  }

  const cleanKey = GEMINI_API_KEY;
  const image = await compressImage(file);

  const promptText = `First determine whether the uploaded image actually contains a restaurant bill or receipt.
A valid restaurant bill/receipt must show clear evidence of a purchase, such as a merchant/restaurant name and itemized purchased items with prices, or a printed subtotal/total.
Do NOT infer or invent a bill from an unrelated photo, screenshot, menu, food photograph, blank page, identity document, or other non-bill image.
If it is not clearly a restaurant bill/receipt, set isBillReceipt to false, explain briefly in nonBillReason, and return empty items with zero totals.
If it is clearly a restaurant bill/receipt, set isBillReceipt to true and extract the restaurant name, purchased food/drink items with quantity, unit price, and item total price, tax breakdown (CGST, SGST, service charge), discount, and stated grand total.
Categorize each item as "VEG", "NON-VEG", or "ANY" (for drinks, water, miscellaneous).
Return ONLY valid raw JSON with this exact schema:
{
  "isBillReceipt": true,
  "nonBillReason": "",
  "restaurantName": "Restaurant Name",
  "items": [
    {
      "name": "Item Name",
      "quantity": 1,
      "unitPrice": 150.00,
      "totalPrice": 150.00,
      "category": "VEG"
    }
  ],
  "tax": {
    "cgst": 13.50,
    "sgst": 13.50,
    "serviceCharge": 0
  },
  "discount": 0,
  "grandTotal": 177.00
}
All monetary numbers must be in Indian Rupees (INR) as plain numbers without currency symbols.
If a tax or discount is not present, use 0. Do not include markdown ticks or explanatory text.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: promptText },
          {
            inline_data: {
              mime_type: image.mimeType,
              data: image.data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  };

  // Determine models to try
  let modelsToTry = [...CANDIDATE_MODELS];
  if (preferredModel && preferredModel !== 'auto') {
    modelsToTry = [preferredModel, ...CANDIDATE_MODELS.filter((m) => m !== preferredModel)];
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), 60000);

  let lastError = null;
  let triedModels = [];

  try {
    for (const model of modelsToTry) {
      triedModels.push(model);
      if (onProgress) {
        onProgress(`Connecting to ${model}…`);
      }

      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify(requestBody),
        });

        // If 404, this specific model is not available or restricted for this account. Fallback to next.
        if (response.status === 404) {
          lastError = new Error(`Model "${model}" returned HTTP 404 Not Found.`);
          continue;
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          const detail = errBody?.error?.message || `HTTP ${response.status}`;

          if (response.status === 400 || response.status === 401 || response.status === 403) {
            throw new Error(`Gemini API key is invalid or lacks permissions: ${detail}`);
          } else if (response.status === 429) {
            throw new Error(`Gemini rate limit or quota exceeded: ${detail}`);
          } else {
            throw new Error(`Gemini request failed (${response.status}): ${detail}`);
          }
        }

        const result = await response.json();
        const candidateText = result.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('');

        if (!candidateText || !candidateText.trim()) {
          throw new Error(`Gemini (${model}) did not return any readable content for this image.`);
        }

        // Strip markdown code fences if present (e.g. ```json ... ```)
        const cleanJson = candidateText
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();

        let parsed;
        try {
          parsed = JSON.parse(cleanJson);
        } catch {
          throw new Error(
            `Could not parse Gemini (${model}) receipt output as JSON. Please review or enter items manually.`,
          );
        }

        const validated = validateReceipt(parsed);
        validated.modelUsed = model;
        return validated;
      } catch (err) {
        // A non-bill classification is definitive for this scan; do not let fallback
        // models reinterpret an unrelated image as a receipt.
        if (err.code === 'NOT_A_BILL') throw err;

        // If it's a fatal authentication or quota error, rethrow immediately.
        if (
          err.message.includes('API key is invalid') ||
          err.message.includes('rate limit') ||
          err.name === 'AbortError'
        ) {
          throw err;
        }
        lastError = err;
      }
    }

    // If all hardcoded models failed with 404, attempt dynamic model discovery
    if (onProgress) onProgress('Discovering available models on the configured API key…');
    try {
      const available = await listAvailableModels();
      const untried = available.filter((m) => !triedModels.includes(m));

      for (const model of untried) {
        if (onProgress) onProgress(`Trying detected model ${model}…`);
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) continue;

        const result = await response.json();
        const candidateText = result.candidates?.[0]?.content?.parts
          ?.map((p) => p.text || '')
          .join('');
        if (!candidateText) continue;

        const cleanJson = candidateText
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
        const parsed = JSON.parse(cleanJson);
        const validated = validateReceipt(parsed);
        validated.modelUsed = model;
        return validated;
      }
    } catch (err) {
      // Preserve the non-bill classification instead of masking it as a model error.
      if (err?.code === 'NOT_A_BILL') throw err;
      /* Otherwise continue with the existing fallback error handling. */
    }

    throw new Error(
      lastError?.message ||
        `Gemini request failed: none of the tested models (${triedModels.slice(0, 3).join(', ')}) were accessible with the configured API key (HTTP 404). Please verify your Google AI Studio project settings and the local environment variable.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
