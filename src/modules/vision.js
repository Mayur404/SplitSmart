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
  'gemini-1.5-flash-latest'
];

/**
 * Resize and compress receipt image to max 1024px dimension at 0.8 quality.
 * Returns { data: base64String, mimeType: 'image/jpeg' }.
 */
export async function compressImage(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Please select a valid image file (JPEG, PNG, WEBP, etc.).');
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = new Image();
    img.src = objectUrl;

    // Wait for image decode with fallback to onload
    await new Promise((resolve, reject) => {
      if (img.decode) {
        img.decode().then(resolve).catch(() => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Could not load or decode the image. Try a standard JPEG, PNG, or WEBP.'));
        });
      } else {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Could not load image.'));
      }
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
        b => (b ? resolve(b) : reject(new Error('Canvas toBlob compression failed.'))),
        'image/jpeg',
        0.8
      );
    });

    const base64 = await blobToBase64(blob);
    return {
      data: base64,
      mimeType: 'image/jpeg',
      originalWidth: width,
      originalHeight: height,
      scaledWidth: targetWidth,
      scaledHeight: targetHeight
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

/**
 * Validate and sanitize extracted receipt data.
 * Recalculates item totals and checks for discrepancies against receipt's stated grand total.
 */
export function validateReceipt(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI output is not a valid JSON object.');
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error('No items were found on the receipt.');
  }

  const parseMoney = (val, fieldName) => {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 10000000) {
      return 0;
    }
    return Math.round((n + Number.EPSILON) * 100) / 100;
  };

  const items = raw.items.slice(0, 100).map((it, idx) => {
    const name = typeof it.name === 'string' && it.name.trim() ? it.name.trim().slice(0, 80) : `Item ${idx + 1}`;
    let qty = Number(it.quantity);
    if (!Number.isFinite(qty) || qty <= 0) qty = 1;
    qty = Math.round(qty * 100) / 100;

    let unitPrice = parseMoney(it.unitPrice, 'Unit price');
    let totalPrice = parseMoney(it.totalPrice, 'Total price');

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
      category
    };
  });

  const tax = raw.tax || {};
  const cgst = parseMoney(tax.cgst, 'CGST');
  const sgst = parseMoney(tax.sgst, 'SGST');
  const serviceCharge = parseMoney(tax.serviceCharge, 'Service charge');
  const discount = parseMoney(raw.discount, 'Discount');

  // Recalculate totals in JavaScript (never trust AI calculations)
  const calculatedFoodSubtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);
  const calculatedGrandTotal = Math.max(0, Math.round((calculatedFoodSubtotal + cgst + sgst + serviceCharge - discount) * 100) / 100);

  const statedGrandTotal = raw.grandTotal != null && Number.isFinite(Number(raw.grandTotal))
    ? parseMoney(raw.grandTotal, 'Grand total')
    : calculatedGrandTotal;

  const hasDiscrepancy = Math.abs(statedGrandTotal - calculatedGrandTotal) > 0.05;

  return {
    restaurantName: typeof raw.restaurantName === 'string' && raw.restaurantName.trim()
      ? raw.restaurantName.trim().slice(0, 80)
      : 'Scanned Receipt',
    items,
    tax: {
      cgst,
      sgst,
      serviceCharge
    },
    discount,
    calculatedGrandTotal,
    statedGrandTotal,
    hasDiscrepancy,
    discrepancyAmount: Math.round((statedGrandTotal - calculatedGrandTotal) * 100) / 100
  };
}

/**
 * Query the models.list endpoint to get all models available on this API key.
 */
export async function listAvailableModels(apiKey) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Please provide an API key.');
  }
  const cleanKey = apiKey.trim();
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
    .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
    .map(m => m.name.replace(/^models\//, ''));
}

/**
 * Scan receipt with automatic model fallback cascade.
 * Tries the preferred model (gemini-2.5-flash by default).
 * If Google returns 404 (model not found / restricted for this API key),
 * automatically cascades through alternative models (gemini-2.0-flash, gemini-1.5-flash, etc.)
 */
export async function scanReceipt(file, apiKey, preferredModel = 'auto', onProgress = null) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Please configure your Gemini API key in Settings before scanning.');
  }

  const cleanKey = apiKey.trim();
  const image = await compressImage(file);

  const promptText = `Analyze this restaurant bill receipt image.
Extract the restaurant name, list of purchased food/drink items with quantity, unit price, and item total price, tax breakdown (CGST, SGST, service charge), discount, and stated grand total.
Categorize each item as "VEG", "NON-VEG", or "ANY" (for drinks, water, miscellaneous).
Return ONLY valid raw JSON with this exact schema:
{
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
              data: image.data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1
    }
  };

  // Determine models to try
  let modelsToTry = [...CANDIDATE_MODELS];
  if (preferredModel && preferredModel !== 'auto') {
    modelsToTry = [preferredModel, ...CANDIDATE_MODELS.filter(m => m !== preferredModel)];
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
            'Content-Type': 'application/json'
          },
          signal: abortController.signal,
          body: JSON.stringify(requestBody)
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
        const candidateText = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');

        if (!candidateText || !candidateText.trim()) {
          throw new Error(`Gemini (${model}) did not return any readable content for this image.`);
        }

        // Strip markdown code fences if present (e.g. ```json ... ```)
        const cleanJson = candidateText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

        let parsed;
        try {
          parsed = JSON.parse(cleanJson);
        } catch {
          throw new Error(`Could not parse Gemini (${model}) receipt output as JSON. Please review or enter items manually.`);
        }

        const validated = validateReceipt(parsed);
        validated.modelUsed = model;
        return validated;
      } catch (err) {
        // If it's a fatal authentication or quota error, rethrow immediately
        if (err.message.includes('API key is invalid') || err.message.includes('rate limit') || err.name === 'AbortError') {
          throw err;
        }
        lastError = err;
      }
    }

    // If all hardcoded models failed with 404, attempt dynamic model discovery
    if (onProgress) onProgress('Discovering available models on your API key…');
    try {
      const available = await listAvailableModels(cleanKey);
      const untried = available.filter(m => !triedModels.includes(m));

      for (const model of untried) {
        if (onProgress) onProgress(`Trying detected model ${model}…`);
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController.signal,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) continue;

        const result = await response.json();
        const candidateText = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
        if (!candidateText) continue;

        const cleanJson = candidateText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
        const parsed = JSON.parse(cleanJson);
        const validated = validateReceipt(parsed);
        validated.modelUsed = model;
        return validated;
      }
    } catch {}

    throw new Error(
      `Gemini request failed: none of the tested models (${triedModels.slice(0, 3).join(', ')}) were accessible with this API key (HTTP 404). Please verify your Google AI Studio project settings or test your key in Settings.`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}
