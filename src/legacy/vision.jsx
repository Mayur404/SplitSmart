/**
 * SplitSmart — vision.jsx
 * Client-Side Image Resizing, JPEG Compression, Multi-Model Gemini Parallel Racing,
 * Intelligent Quota & Rate-Limit Handling, and JSON Validation.
 */

import {
  GEMINI_MODELS,
  DEFAULT_RACING_MODELS,
  getModelLabel
} from '../config/gemini.jsx';
import {
  classifyQuotaError,
  getModelStatus,
  getAllModelStatuses,
  updateModelStatus,
  markModelSuccess,
  markModel404,
  isModelEligibleForRacing,
  getEligibleRacingModels,
  formatModelAvailabilityReport,
  updateModelAvailabilityUI
} from './quota.jsx';

export const CANDIDATE_MODELS = DEFAULT_RACING_MODELS;

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
 * Standard prompt text for Gemini vision extraction and validation.
 */
export const RECEIPT_PROMPT = `You are the image validation and receipt extraction engine for SplitSmart, an application that helps users split bills among multiple people.

Your first responsibility is to determine whether the uploaded image contains a genuine bill or payment receipt. Do not extract bill information until the image passes validation.

1. Image Classification
Examine the uploaded image and determine whether it contains a genuine bill or receipt, such as:
- Restaurant bills
- Hotel bills
- Food and grocery receipts
- Shopping invoices
- Other itemized payment receipts

Reject images containing:
- People, animals, landscapes or unrelated photographs
- Screenshots of websites or applications unrelated to a bill
- Restaurant menus without an actual bill
- Product photographs
- Blank images
- Handwritten notes that are not bills
- Documents unrelated to payments
- Blurry or unreadable images where bill contents cannot be verified

2. Strict Validation Rules
Set isBillReceipt to true ONLY when:
- The image visibly contains an actual bill or payment receipt.
- There is sufficient evidence that it represents a transaction.
- At least one priced bill item can be identified.

Set isBillReceipt to false when:
- The image is not a bill or receipt.
- The image is ambiguous or does not provide sufficient evidence.
- No priced line item can be identified.
- The image is too blurry or incomplete to reliably verify.

Important: Never assume that an image is a bill just because it contains numbers, currency symbols, names or prices.

3. Bill Information Extraction
Only when isBillReceipt is true, extract:
- Merchant or restaurant name
- Bill date (YYYY-MM-DD format if readable, else null)
- Currency (e.g. "INR", "USD", etc.)
- Item names, quantities, individual item prices, item total prices
- Categorize each item as "VEG", "NON-VEG", or "ANY" (for drinks, water, miscellaneous)
- Subtotal
- Combined GST percentage (if printed with %, e.g. 5 for 5%)
- CGST percentage (if printed with %, e.g. 2.5 for 2.5%)
- SGST percentage (if printed with %, e.g. 2.5 for 2.5%)
- Service-charge percentage (if printed with %, e.g. 10 for 10%)
- Fixed service-charge amount (if charged as fixed currency amount, or null)
- Fixed tax amounts (if charged as fixed currency amount, or null)
- Fixed discount amount (if present, or null)
- Printed GST, CGST, SGST, service charge currency amounts
- Final printed receipt grand total

4. Accuracy Requirements
- Strictly distinguish between percentage rates (with %) and fixed currency amounts.
- If the receipt prints GST 5%, extract gstRate: 5.0.
- If it prints CGST 2.5% and SGST 2.5%, extract cgstRate: 2.5, sgstRate: 2.5.
- If it prints Service Charge 10%, extract serviceChargeRate: 10.0.
- Never invent a missing percentage.
- Never calculate a percentage by dividing charges by food subtotal.
- Never infer compounding.
- If a percentage cannot be confidently identified, return null.
- Preserve original item names as closely as possible.
- Return null for information that cannot be identified.
- Preserve decimal values accurately.

5. Required JSON Response
Return ONLY valid JSON. Do not include Markdown, explanations outside JSON, or code fences.

If isBillReceipt is true:
{
  "isBillReceipt": true,
  "confidence": 0.98,
  "reason": "A restaurant bill was detected with identifiable priced items.",
  "merchantName": "Restaurant Name",
  "date": "2026-11-05",
  "currency": "INR",
  "items": [
    {
      "name": "Chicken Biryani",
      "quantity": 2,
      "unitPrice": 250.00,
      "totalPrice": 500.00,
      "category": "NON-VEG"
    }
  ],
  "subtotal": 500.00,
  "gstRate": 5.0,
  "cgstRate": null,
  "sgstRate": null,
  "serviceChargeRate": 10.0,
  "gst": 61.05,
  "serviceCharge": 111.00,
  "cgst": null,
  "sgst": null,
  "fixedServiceCharge": null,
  "fixedTax": null,
  "discount": null,
  "total": 1282.05
}

If isBillReceipt is false:
{
  "isBillReceipt": false,
  "confidence": 0.99,
  "reason": "The uploaded image does not contain a bill or receipt.",
  "merchantName": null,
  "date": null,
  "currency": null,
  "items": [],
  "subtotal": null,
  "gstRate": null,
  "cgstRate": null,
  "sgstRate": null,
  "serviceChargeRate": null,
  "gst": null,
  "serviceCharge": null,
  "cgst": null,
  "sgst": null,
  "fixedServiceCharge": null,
  "fixedTax": null,
  "discount": null,
  "total": null
}

6. Final Safety Rule
Receipt validation must happen BEFORE bill information is imported into SplitSmart.
If isBillReceipt is false, do not return extracted bill items or attempt to create a bill.
If the image is invalid, return a clear reason so the application can display an appropriate alert:
"This image doesn't appear to be a bill or receipt. Please upload a valid bill."`;

/**
 * Detect whether a receipt applied GST on Subtotal alone (independent)
 * or on (Subtotal + Service Charge) (compounded / receipt basis).
 *
 * If evidence is ambiguous or neither matches within rounding tolerance,
 * leaves taxBasis as 'unconfirmed' without guessing.
 */
export function detectReceiptTaxBasis(subtotal, serviceCharge, cgst, sgst, gstRate = null, combinedGst = 0) {
  const splitGst = ((cgst || 0) + (sgst || 0));
  const actualGst = splitGst > 0
    ? Math.round(splitGst * 100) / 100
    : Math.round((Number(combinedGst) || 0) * 100) / 100;

  // If no service charge or no GST, independent is standard
  if (!serviceCharge || serviceCharge <= 0 || actualGst <= 0 || !subtotal || subtotal <= 0) {
    return {
      taxBasis: 'independent',
      isConfirmed: true,
      reason: 'No compounding possible (service charge or tax is zero).'
    };
  }

  // Candidate rates to test (explicit, common rates, or inferred)
  const candidateRates = gstRate ? [Number(gstRate)] : [5, 12, 18, 28, Math.round((actualGst / subtotal) * 1000) / 10];

  let matchesCompounded = false;
  let matchesIndependent = false;
  let matchingRate = null;

  for (const rate of candidateRates) {
    if (!rate || rate <= 0) continue;
    const expInd = Math.round(subtotal * (rate / 100) * 100) / 100;
    const expComp = Math.round((subtotal + serviceCharge) * (rate / 100) * 100) / 100;

    const diffInd = Math.abs(actualGst - expInd);
    const diffComp = Math.abs(actualGst - expComp);

    // Tolerance of 0.05 for paise rounding
    if (diffComp <= 0.05 && diffInd > 0.05) {
      matchesCompounded = true;
      matchingRate = rate;
      break;
    }
    if (diffInd <= 0.05 && diffComp > 0.05) {
      matchesIndependent = true;
      matchingRate = rate;
      break;
    }
  }

  if (matchesCompounded && !matchesIndependent) {
    return {
      taxBasis: 'receipt',
      isConfirmed: true,
      gstRate: matchingRate,
      reason: `GST (₹${actualGst}) matches ${matchingRate}% on Subtotal + Service Charge.`
    };
  }

  if (matchesIndependent && !matchesCompounded) {
    return {
      taxBasis: 'independent',
      isConfirmed: true,
      gstRate: matchingRate,
      reason: `GST (₹${actualGst}) matches ${matchingRate}% on Subtotal alone.`
    };
  }

  // Inconclusive evidence: do not guess!
  return {
    taxBasis: 'unconfirmed',
    isConfirmed: false,
    reason: 'Printed tax basis is ambiguous. Please select calculation mode.'
  };
}

/**
 * Validate and sanitize extracted receipt data.
 * Validates isBillReceipt BEFORE any bill information is imported into SplitSmart.
 * Recalculates item totals and checks for discrepancies against receipt's stated grand total.
 */
export function validateReceipt(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI output is not a valid JSON object.');
  }

  // Safety Gate: Reject non-bill images immediately
  if (raw.isBillReceipt === false) {
    const isBlurryOrUnreadable = /blurry|unreadable|clearer|incomplete|cannot be verified/i.test(raw.reason || '');
    if (isBlurryOrUnreadable) {
      throw new Error("We couldn't identify a readable bill. Please upload a clearer receipt.");
    }
    throw new Error("This image doesn't appear to be a bill or receipt. Please upload a valid bill.");
  }

  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    throw new Error("We couldn't identify a readable bill. Please upload a clearer receipt.");
  }

  const parseMoney = (val) => {
    if (val === null || val === undefined) return 0;
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
      category
    };
  });

  const tax = raw.tax || {};
  const cgst = parseMoney(raw.cgst ?? tax.cgst);
  const sgst = parseMoney(raw.sgst ?? tax.sgst);
  const rawCombinedGst = parseMoney(raw.gst ?? tax.gst);
  const serviceCharge = parseMoney(raw.serviceCharge ?? tax.serviceCharge);
  const discount = parseMoney(raw.discount);

  const rawGstRate = raw.gstRate != null && Number.isFinite(Number(raw.gstRate)) ? Number(raw.gstRate) : (tax.gstRate != null ? Number(tax.gstRate) : null);
  const rawCgstRate = raw.cgstRate != null && Number.isFinite(Number(raw.cgstRate)) ? Number(raw.cgstRate) : (tax.cgstRate != null ? Number(tax.cgstRate) : null);
  const rawSgstRate = raw.sgstRate != null && Number.isFinite(Number(raw.sgstRate)) ? Number(raw.sgstRate) : (tax.sgstRate != null ? Number(tax.sgstRate) : null);
  const rawScRate = raw.serviceChargeRate != null && Number.isFinite(Number(raw.serviceChargeRate)) ? Number(raw.serviceChargeRate) : (tax.serviceChargeRate != null ? Number(tax.serviceChargeRate) : (raw.scRate != null ? Number(raw.scRate) : null));

  // Determine explicit percentage rates:
  // For split GST: gstRate = cgstRate + sgstRate
  // For combined GST: gstRate = combinedGstRate
  // Never add combined GST alongside CGST and SGST
  let effectiveGstRate = 0;
  if ((rawCgstRate && rawCgstRate > 0) || (rawSgstRate && rawSgstRate > 0)) {
    effectiveGstRate = (rawCgstRate || 0) + (rawSgstRate || 0);
  } else if (rawGstRate && rawGstRate > 0) {
    effectiveGstRate = rawGstRate;
  }

  const effectiveScRate = rawScRate && rawScRate > 0 ? rawScRate : 0;
  const combinedRate = effectiveGstRate + effectiveScRate;

  // Fixed amounts (when charges are fixed numbers rather than percentages)
  const fixedServiceCharge = parseMoney(raw.fixedServiceCharge ?? (effectiveScRate === 0 && serviceCharge > 0 ? serviceCharge : 0));
  const fixedTax = parseMoney(raw.fixedTax ?? (effectiveGstRate === 0 && (cgst > 0 || sgst > 0 || rawCombinedGst > 0) ? ((cgst > 0 || sgst > 0) ? (cgst + sgst) : rawCombinedGst) : 0));
  const fixedDiscount = parseMoney(raw.fixedDiscount ?? discount);

  // Recalculate food subtotal in JavaScript (never trust AI calculations)
  const calculatedFoodSubtotal = items.reduce((acc, it) => acc + it.totalPrice, 0);
  const foodSubtotalPaise = Math.round(calculatedFoodSubtotal * 100);

  // Calculate participant allocation total using the combined rate rule:
  // additionalCharge = Math.round(foodSubtotalPaise * combinedRate / 100)
  // finalShare = foodSubtotalPaise + additionalCharge
  const allocatedAdditionalPaise = Math.round((foodSubtotalPaise * combinedRate) / 100);
  const fixedNetPaise = Math.round((fixedTax + fixedServiceCharge - fixedDiscount) * 100);
  const calculatedGrandTotalPaise = Math.max(0, foodSubtotalPaise + allocatedAdditionalPaise + fixedNetPaise);
  const calculatedGrandTotal = calculatedGrandTotalPaise / 100;

  const rawTotal = raw.total ?? raw.grandTotal;
  const statedGrandTotal = rawTotal != null && Number.isFinite(Number(rawTotal))
    ? parseMoney(rawTotal)
    : calculatedGrandTotal;
  const statedGrandTotalPaise = Math.round(statedGrandTotal * 100);

  // Stated total vs. Calculated allocation total discrepancy
  const discrepancyPaise = statedGrandTotalPaise - calculatedGrandTotalPaise;
  const hasDiscrepancy = Math.abs(discrepancyPaise) > 5;
  const discrepancyAmount = Math.round(discrepancyPaise) / 100;

  const printedGst = parseMoney(raw.gst ?? raw.gstAmount);
  const printedSc = parseMoney(raw.serviceCharge ?? raw.serviceChargeAmount);
  const printedCgst = parseMoney(raw.cgst ?? raw.cgstAmount);
  const printedSgst = parseMoney(raw.sgst ?? raw.sgstAmount);

  const merchantName = (typeof raw.merchantName === 'string' && raw.merchantName.trim())
    ? raw.merchantName.trim().slice(0, 80)
    : (typeof raw.restaurantName === 'string' && raw.restaurantName.trim())
    ? raw.restaurantName.trim().slice(0, 80)
    : 'Scanned Receipt';

  return {
    isBillReceipt: true,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.98,
    reason: raw.reason || 'Valid bill receipt detected with identifiable priced items.',
    merchantName,
    restaurantName: merchantName,
    date: raw.date || null,
    currency: raw.currency || 'INR',
    items,
    rates: {
      gstRate: effectiveGstRate,
      cgstRate: rawCgstRate || 0,
      sgstRate: rawSgstRate || 0,
      serviceChargeRate: effectiveScRate,
      combinedRate
    },
    taxRates: {
      gstRate: effectiveGstRate,
      cgstRate: rawCgstRate || 0,
      sgstRate: rawSgstRate || 0,
      serviceChargeRate: effectiveScRate,
      combinedRate
    },
    tax: {
      isCombined: (effectiveGstRate > 0 && !rawCgstRate && !rawSgstRate) || Boolean(printedGst && !printedCgst && !printedSgst),
      cgst: (rawCgstRate && rawCgstRate > 0) ? Math.round(calculatedFoodSubtotal * rawCgstRate) / 100 : (printedCgst || cgst),
      sgst: (rawSgstRate && rawSgstRate > 0) ? Math.round(calculatedFoodSubtotal * rawSgstRate) / 100 : (printedSgst || sgst),
      gst: effectiveGstRate > 0 ? Math.round(calculatedFoodSubtotal * effectiveGstRate) / 100 : (printedGst || rawCombinedGst),
      serviceCharge: effectiveScRate > 0 ? Math.round(calculatedFoodSubtotal * effectiveScRate) / 100 : (printedSc || serviceCharge || fixedServiceCharge),
      gstRate: effectiveGstRate,
      cgstRate: rawCgstRate || 0,
      sgstRate: rawSgstRate || 0,
      serviceChargeRate: effectiveScRate,
      combinedRate
    },
    fixedAmounts: {
      serviceCharge: fixedServiceCharge,
      tax: fixedTax,
      discount: fixedDiscount
    },
    discount: fixedDiscount,
    subtotal: calculatedFoodSubtotal,
    allocatedAdditionalCharges: allocatedAdditionalPaise / 100,
    calculatedGrandTotal,
    statedGrandTotal,
    hasDiscrepancy,
    discrepancyAmount
  };
}

/**
 * Query the models.list endpoint to get all models available on this API key.
 */
export async function listAvailableModels(apiKey, fetchFn = globalThis.fetch) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Please provide an API key.');
  }
  const cleanKey = apiKey.trim();
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(cleanKey)}`;
  const response = await fetchFn(endpoint);
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
 * Execute parallel Gemini model racing for receipt scanning.
 * Concurrently dispatches requests to all eligible candidate models.
 * The FIRST model that returns a valid, verified bill receipt wins, immediately
 * populating the bill and aborting all other pending requests.
 *
 * Intelligently handles quota and rate-limit errors:
 * - Detects 429 and RESOURCE_EXHAUSTED errors.
 * - Identifies zero Free Tier quota (permanent for config), RPM, RPD, Token limits, or billing restrictions.
 * - Never allows a single model's quota error to fail the race; other eligible models continue.
 * - Respects Retry-After and cooldown periods without busy polling.
 * - Updates model availability status in real-time.
 *
 * @param {File|Blob|{data: string, mimeType: string}} fileOrImage
 * @param {string} apiKey
 * @param {object} [options]
 * @param {string[]} [options.models] - Candidate models to race
 * @param {boolean} [options.skipEligibilityCheck=false] - For targeted testing
 * @param {AbortSignal} [options.signal] - External cancellation signal
 * @param {number} [options.timeoutMs=60000] - Overall timeout
 * @param {Function} [options.fetchFn=globalThis.fetch] - Custom fetch for testing
 * @param {Function} [onProgress] - Optional progress notification callback
 * @returns {Promise<object>} Validated receipt data with winningModel and winningModelLabel
 */
export async function scanReceiptParallel(fileOrImage, apiKey, options = {}, onProgress = null) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('Please configure your Gemini API key in .env (VITE_GEMINI_API_KEY) before scanning.');
  }

  const cleanKey = apiKey.trim();
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 60000;

  const allCandidates = (options.models && options.models.length > 0) ? options.models : DEFAULT_RACING_MODELS;
  const models = options.skipEligibilityCheck ? allCandidates : getEligibleRacingModels(allCandidates);

  // If all candidate models are currently ineligible (e.g. rate-limited, zero quota, etc.)
  if (models.length === 0) {
    const report = formatModelAvailabilityReport(allCandidates);
    throw new Error(`All configured AI models are currently unavailable:\n\n${report}\n\nPlease wait for rate limits to reset, upgrade your Gemini API quota, or enter items manually.`);
  }

  // Single image compression step (reused across all parallel model requests)
  let image;
  if (fileOrImage && typeof fileOrImage.data === 'string' && typeof fileOrImage.mimeType === 'string') {
    image = fileOrImage;
  } else {
    if (onProgress) onProgress('Compressing image…');
    image = await compressImage(fileOrImage);
  }

  const requestBody = {
    contents: [
      {
        parts: [
          { text: RECEIPT_PROMPT },
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

  const bodyString = JSON.stringify(requestBody);

  // Setup abort controller: aborted on win, on timeout, or on external cancellation
  const masterAbort = new AbortController();
  const externalSignal = options.signal;

  if (externalSignal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const abortListener = () => masterAbort.abort();
  if (externalSignal) {
    externalSignal.addEventListener('abort', abortListener, { once: true });
  }

  const timeoutId = setTimeout(() => {
    masterAbort.abort();
  }, timeoutMs);

  if (onProgress) {
    onProgress(`Racing ${models.length} AI models…`);
  }

  const modelOutcomes = [];
  let isRaceSettled = false;

  try {
    const winner = await new Promise((resolve, reject) => {
      let pendingCount = models.length;

      const checkAllDone = () => {
        if (isRaceSettled) return;
        if (pendingCount <= 0) {
          isRaceSettled = true;

          // Analyze failure causes to produce the most accurate, helpful error
          const nonBillOutcomes = modelOutcomes.filter(o => o.isBillReceipt === false);
          const quotaOutcomes = modelOutcomes.filter(o => o.isQuota);
          const authError = modelOutcomes.find(o => o.isAuth);

          if (authError && quotaOutcomes.length === 0 && nonBillOutcomes.length === 0) {
            reject(authError.error);
            return;
          }

          if (nonBillOutcomes.length > 0) {
            const anyBlurry = nonBillOutcomes.some(o => /blurry|unreadable|clearer|incomplete|cannot be verified/i.test(o.reason || ''));
            if (anyBlurry) {
              reject(new Error("We couldn't identify a readable bill. Please upload a clearer receipt."));
            } else {
              reject(new Error("This image doesn't appear to be a bill or receipt. Please upload a valid bill."));
            }
            return;
          }

          // If all tested models failed due to quota or rate limits
          if (quotaOutcomes.length > 0) {
            const report = formatModelAvailabilityReport(allCandidates);
            reject(new Error(`All configured AI models are currently unavailable:\n\n${report}\n\nPlease wait for rate limits to reset, upgrade your Gemini API quota, or enter items manually.`));
            return;
          }

          const all404 = modelOutcomes.length > 0 && modelOutcomes.every(o => o.is404);
          if (all404) {
            reject(new Error("None of the tested AI models were accessible with this API key (HTTP 404). Please verify your Google AI Studio project settings."));
            return;
          }

          reject(new Error("We couldn't identify a readable bill. Please upload a clearer receipt."));
        }
      };

      // Spawn concurrent fetches for each candidate model
      models.forEach(modelId => {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(cleanKey)}`;

        fetchFn(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: masterAbort.signal,
          body: bodyString
        })
          .then(async response => {
            if (isRaceSettled) return;

            if (response.status === 404) {
              markModel404(modelId);
              modelOutcomes.push({ model: modelId, is404: true });
              return;
            }

            if (!response.ok) {
              const errBody = await response.json().catch(() => null);
              const detail = errBody?.error?.message || `HTTP ${response.status}`;

              // Intelligent Quota & Rate-Limit Detection
              const quotaClassification = classifyQuotaError(response.status, errBody, response.headers);
              if (quotaClassification.isQuota) {
                updateModelStatus(modelId, quotaClassification);
                modelOutcomes.push({
                  model: modelId,
                  isQuota: true,
                  classification: quotaClassification,
                  error: new Error(`[${quotaClassification.statusLabel}] ${detail}`)
                });
                return; // Quota error in one model does NOT abort the race! Other models continue.
              }

              if (response.status === 400 || response.status === 401 || response.status === 403) {
                modelOutcomes.push({ model: modelId, isAuth: true, error: new Error(`Gemini API key is invalid or lacks permissions: ${detail}`) });
              } else {
                modelOutcomes.push({ model: modelId, error: new Error(`Model ${modelId} error (${response.status}): ${detail}`) });
              }
              return;
            }

            const result = await response.json();
            if (isRaceSettled) return;

            const candidateText = result.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
            if (!candidateText || !candidateText.trim()) {
              modelOutcomes.push({ model: modelId, error: new Error(`No text returned by ${modelId}`) });
              return;
            }

            const cleanJson = candidateText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            let parsed;
            try {
              parsed = JSON.parse(cleanJson);
            } catch {
              modelOutcomes.push({ model: modelId, error: new Error(`Invalid JSON from ${modelId}`) });
              return;
            }

            // Strictly check validation gate
            if (parsed.isBillReceipt === false) {
              modelOutcomes.push({ model: modelId, isBillReceipt: false, reason: parsed.reason });
              return; // Do NOT let a non-bill rejecter win the race! Other models may detect correctly.
            }

            try {
              const validated = validateReceipt(parsed);
              if (isRaceSettled) return;

              // FIRST VALID WINNER!
              isRaceSettled = true;
              markModelSuccess(modelId);
              validated.winningModel = modelId;
              validated.winningModelLabel = getModelLabel(modelId);
              validated.modelUsed = modelId;

              // Abort all other racing models immediately
              masterAbort.abort();
              resolve(validated);
            } catch (err) {
              modelOutcomes.push({ model: modelId, error: err, isBillReceipt: false, reason: err.message });
            }
          })
          .catch(err => {
            if (isRaceSettled) return;
            if (err.name === 'AbortError') return;
            modelOutcomes.push({ model: modelId, error: err });
          })
          .finally(() => {
            pendingCount--;
            checkAllDone();
          });
      });
    });

    return winner;
  } catch (err) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', abortListener);
    }
  }
}

/**
 * Scan receipt entrypoint.
 * Preserves compatibility with existing callers.
 * If preferredModel is 'auto' or omitted, uses scanReceiptParallel with all configured models.
 */
export async function scanReceipt(file, apiKey, preferredModel = 'auto', onProgress = null, options = {}) {
  const models = (preferredModel && preferredModel !== 'auto')
    ? [preferredModel, ...DEFAULT_RACING_MODELS.filter(m => m !== preferredModel)]
    : DEFAULT_RACING_MODELS;

  return scanReceiptParallel(file, apiKey, { ...options, models }, onProgress);
}
