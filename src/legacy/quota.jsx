/**
 * SplitSmart — quota.jsx
 * Intelligent Gemini API Quota, Rate-Limit Detection, Model Availability Tracking,
 * and Status UI Presentation.
 */

import { DEFAULT_RACING_MODELS, getModelLabel } from '../config/gemini.jsx';

/**
 * Storage key for session persistence of model quota state.
 */
const STORAGE_KEY = 'splitsmart_gemini_model_status';

/**
 * In-memory map of model status records.
 * Initialized from sessionStorage if available.
 */
const modelStatusMap = new Map();

/**
 * Safe helper to access sessionStorage
 */
function getStoredStatus() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
}

function persistStatus() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const obj = {};
      for (const [key, val] of modelStatusMap.entries()) {
        obj[key] = val;
      }
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }
  } catch {}
}

// Hydrate from storage if present
const stored = getStoredStatus();
if (stored && typeof stored === 'object') {
  for (const [key, val] of Object.entries(stored)) {
    modelStatusMap.set(key, val);
  }
}

/**
 * Parse retry delay from string (e.g. "21s", "15.5s") or number.
 */
export function parseRetryDelay(delayVal) {
  if (!delayVal) return null;
  if (typeof delayVal === 'number' && Number.isFinite(delayVal) && delayVal > 0) {
    return Math.round(delayVal);
  }
  const match = String(delayVal).trim().match(/^([\d.]+)\s*s?$/i);
  if (match) {
    const val = parseFloat(match[1]);
    return Number.isFinite(val) && val > 0 ? Math.ceil(val) : null;
  }
  return null;
}

/**
 * Parse Retry-After header (seconds or HTTP date).
 */
export function parseRetryAfterHeader(headers) {
  if (!headers) return null;
  const raw = typeof headers.get === 'function'
    ? headers.get('retry-after')
    : headers['retry-after'] || headers['Retry-After'];

  if (!raw) return null;
  const asNum = Number(raw);
  if (Number.isFinite(asNum) && asNum > 0) {
    return Math.ceil(asNum);
  }
  const parsedDate = Date.parse(raw);
  if (!Number.isNaN(parsedDate)) {
    return Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
  }
  return null;
}

/**
 * Classify a Gemini API error to determine quota / rate-limit specifics.
 *
 * Distinguishes between:
 * 1. zero_quota: Free Tier quota is zero (quota limit = 0). Permanent for current config.
 * 2. rate_limit_rpm: Requests per minute exceeded (temporary, retry in seconds).
 * 3. rate_limit_rpd: Requests per day exceeded (daily quota reached).
 * 4. token_quota: Input tokens per minute / TPM exceeded.
 * 5. billing_restricted: Billing required or account payment restricted.
 * 6. general_quota: General RESOURCE_EXHAUSTED / 429.
 *
 * @param {number} status - HTTP status code
 * @param {object|string} errBody - Parsed JSON or string response body
 * @param {Headers|object} [headers] - Response headers
 * @returns {object} Classification details
 */
export function classifyQuotaError(status, errBody, headers = null) {
  const is429 = status === 429;
  const isQuotaStatus = status === 429 || status === 403 || status === 400;

  const bodyObj = (errBody && typeof errBody === 'object') ? errBody : {};
  const errorObj = bodyObj.error || (typeof errBody === 'object' ? errBody : {});
  const message = String(errorObj.message || (typeof errBody === 'string' ? errBody : '') || '');
  const errorStatus = String(errorObj.status || '');
  const details = Array.isArray(errorObj.details) ? errorObj.details : [];

  const errorInfo = details.find(d => d && typeof d === 'object' && String(d['@type'] || '').includes('ErrorInfo'));
  const retryInfo = details.find(d => d && typeof d === 'object' && String(d['@type'] || '').includes('RetryInfo'));
  const quotaFailure = details.find(d => d && typeof d === 'object' && String(d['@type'] || '').includes('QuotaFailure'));

  const metadata = (errorInfo && typeof errorInfo.metadata === 'object') ? errorInfo.metadata : {};
  const violations = Array.isArray(quotaFailure?.violations) ? quotaFailure.violations : [];
  const violationDescriptions = violations.map(v => v.description || '').join(' ');

  const allText = `${message} ${errorStatus} ${violationDescriptions} ${JSON.stringify(metadata)}`;
  const isResourceExhausted = is429 || errorStatus === 'RESOURCE_EXHAUSTED' || /RESOURCE_EXHAUSTED|QUOTA_EXCEEDED|RATE_LIMIT_EXCEEDED/i.test(allText);

  if (!isResourceExhausted && !/quota|rate\s*limit|per\s*minute|billing/i.test(allText)) {
    return {
      isQuota: false,
      type: 'other_error',
      statusLabel: 'Error',
      isZeroQuota: false,
      isTemporary: false,
      retryDelaySec: null,
      retryAfter: null,
      reason: message || `HTTP ${status}`
    };
  }

  // Extract retry delay from RetryInfo or HTTP header
  const retryDelaySec = parseRetryDelay(retryInfo?.retryDelay) || parseRetryAfterHeader(headers);

  // 1. Check for Zero Free Tier Quota (Permanent for this key/config)
  const quotaLimit = metadata.quota_limit !== undefined ? String(metadata.quota_limit).trim() : null;
  const isZeroLimit = quotaLimit === '0' ||
    /quota\s*limit\s*['":]?\s*0\b/i.test(allText) ||
    /limit\s*['":]?\s*0\b/i.test(allText) ||
    /free\s*tier.*(?:quota\s*(?:is|of)\s*0|not\s*supported|unavailable|zero)/i.test(allText) ||
    /quota\s*(?:of|is)\s*0\b/i.test(allText) ||
    /zero\s*free\s*tier\s*quota/i.test(allText);

  if (isZeroLimit) {
    return {
      isQuota: true,
      type: 'zero_quota',
      statusLabel: 'Free Tier unavailable',
      isZeroQuota: true,
      isTemporary: false,
      retryDelaySec: null,
      retryAfter: null,
      reason: 'Free Tier quota is 0 for this model on this API key. Skip until billing or quota is enabled.'
    };
  }

  // 2. Billing or account restriction
  if (status === 403 || /billing\s*(?:disabled|not\s*enabled|required)|BILLING_DISABLED|account\s*restricted/i.test(allText)) {
    return {
      isQuota: true,
      type: 'billing_restricted',
      statusLabel: 'Billing required',
      isZeroQuota: true,
      isTemporary: false,
      retryDelaySec: null,
      retryAfter: null,
      reason: 'Billing account or payment method is required for this model.'
    };
  }

  // 3. Requests-Per-Day (RPD) limit
  if (metadata.quota_metric?.includes('requests_per_day') || /requests?[\s_]*per[\s_]*day|RPD|daily\s*(?:request|quota)/i.test(allText)) {
    const delay = retryDelaySec || 86400;
    return {
      isQuota: true,
      type: 'rate_limit_rpd',
      statusLabel: 'Daily quota exceeded',
      isZeroQuota: false,
      isTemporary: true,
      retryDelaySec: delay,
      retryAfter: Date.now() + delay * 1000,
      reason: 'Daily request quota exceeded. Available tomorrow.'
    };
  }

  // 4. Input-token quota (TPM)
  if (metadata.quota_metric?.includes('token') || /input[\s_]*tokens?|tokens?[\s_]*per[\s_]*minute|TPM|\btokens?\b/i.test(allText)) {
    const delay = retryDelaySec || 60;
    return {
      isQuota: true,
      type: 'token_quota',
      statusLabel: 'Token quota exceeded',
      isZeroQuota: false,
      isTemporary: true,
      retryDelaySec: delay,
      retryAfter: Date.now() + delay * 1000,
      reason: `Token quota exceeded. Retry in ${delay}s.`
    };
  }

  // 5. Requests-Per-Minute (RPM) limit
  if (metadata.quota_metric?.includes('requests_per_minute') || /requests?[\s_]*per[\s_]*minute|RPM|RATE_LIMIT_EXCEEDED/i.test(allText)) {
    const delay = retryDelaySec || 60;
    return {
      isQuota: true,
      type: 'rate_limit_rpm',
      statusLabel: 'Rate limited',
      isZeroQuota: false,
      isTemporary: true,
      retryDelaySec: delay,
      retryAfter: Date.now() + delay * 1000,
      reason: `Requests per minute limit exceeded. Retry in ${delay}s.`
    };
  }

  // 6. General fallback for 429
  const delay = retryDelaySec || 60;
  return {
    isQuota: true,
    type: 'general_quota',
    statusLabel: 'Rate limited',
    isZeroQuota: false,
    isTemporary: true,
    retryDelaySec: delay,
    retryAfter: Date.now() + delay * 1000,
    reason: `Rate limit or quota exceeded. Retry in ${delay}s.`
  };
}

/**
 * Get the current availability status of a model.
 * Automatically clears expired temporary rate limits.
 */
export function getModelStatus(modelId) {
  let record = modelStatusMap.get(modelId);

  if (!record) {
    record = {
      status: 'available',
      statusLabel: 'Available',
      isZeroQuota: false,
      retryAfter: null,
      retryDelaySec: null,
      lastChecked: Date.now(),
      reason: null
    };
    modelStatusMap.set(modelId, record);
    return { ...record };
  }

  // If temporary rate limit cooldown has elapsed, auto-recover to Available
  if (record.retryAfter && Date.now() >= record.retryAfter) {
    record.status = 'available';
    record.statusLabel = 'Available';
    record.retryAfter = null;
    record.retryDelaySec = null;
    record.reason = null;
    record.lastChecked = Date.now();
    persistStatus();
  }

  const remainingSec = record.retryAfter ? Math.max(1, Math.ceil((record.retryAfter - Date.now()) / 1000)) : null;

  return {
    ...record,
    remainingSec
  };
}

/**
 * Get status of all racing models.
 */
export function getAllModelStatuses(models = DEFAULT_RACING_MODELS) {
  return models.map(id => {
    const status = getModelStatus(id);
    return {
      id,
      label: getModelLabel(id),
      ...status
    };
  });
}

/**
 * Update a model's status based on API classification.
 */
export function updateModelStatus(modelId, classification) {
  const current = getModelStatus(modelId);
  const updated = {
    ...current,
    status: classification.type,
    statusLabel: classification.statusLabel,
    isZeroQuota: Boolean(classification.isZeroQuota),
    retryAfter: classification.retryAfter || null,
    retryDelaySec: classification.retryDelaySec || null,
    reason: classification.reason,
    lastChecked: Date.now()
  };

  modelStatusMap.set(modelId, updated);
  persistStatus();
  updateModelAvailabilityUI();
  return updated;
}

/**
 * Mark a model as successfully verified / available.
 */
export function markModelSuccess(modelId) {
  const record = {
    status: 'available',
    statusLabel: 'Available',
    isZeroQuota: false,
    retryAfter: null,
    retryDelaySec: null,
    reason: null,
    lastChecked: Date.now()
  };
  modelStatusMap.set(modelId, record);
  persistStatus();
  updateModelAvailabilityUI();
  return record;
}

/**
 * Mark a model as returning 404 (not supported on this key).
 */
export function markModel404(modelId) {
  const record = {
    status: 'unsupported',
    statusLabel: 'Not supported',
    isZeroQuota: true, // Do not keep retrying
    retryAfter: null,
    retryDelaySec: null,
    reason: 'Model is not accessible with this API key (HTTP 404).',
    lastChecked: Date.now()
  };
  modelStatusMap.set(modelId, record);
  persistStatus();
  updateModelAvailabilityUI();
  return record;
}

/**
 * Check whether a model is eligible to participate in the race.
 * - Models with zero Free Tier quota (isZeroQuota) are NEVER eligible.
 * - Models with billing restrictions are NOT eligible.
 * - Models currently in rate-limit cooldown are NOT eligible until cooldown expires.
 */
export function isModelEligibleForRacing(modelId) {
  const info = getModelStatus(modelId);
  if (info.isZeroQuota) return false;
  if (info.status === 'billing_restricted') return false;
  if (info.status === 'unsupported') return false;
  if (info.retryAfter && Date.now() < info.retryAfter) return false;
  return true;
}

/**
 * Filter an array of candidate models to only those currently eligible to race.
 */
export function getEligibleRacingModels(models = DEFAULT_RACING_MODELS) {
  return models.filter(isModelEligibleForRacing);
}

/**
 * Formats a clean itemized report of model statuses.
 */
export function formatModelAvailabilityReport(models = DEFAULT_RACING_MODELS) {
  return models.map(id => {
    const info = getModelStatus(id);
    const label = getModelLabel(id);
    const extra = info.remainingSec ? ` (retry in ${info.remainingSec}s)` : '';
    return `- ${label} — ${info.statusLabel}${extra}`;
  }).join('\n');
}

/**
 * Reset all model statuses back to available (e.g. on new key or test reset).
 */
export function resetModelStatuses() {
  modelStatusMap.clear();
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
  updateModelAvailabilityUI();
}

/**
 * Generates HTML markup for the model availability status component.
 * By default, this component is rendered collapsed and can be expanded on click.
 */
export function renderModelAvailabilityHTML() {
  const all = getAllModelStatuses();
  const availableCount = all.filter(m => m.status === 'available').length;
  const totalCount = all.length;
  const isOpen = typeof window !== 'undefined' && Boolean(window.__scModelsOpen);

  return `
    <details class="sc-models-box" id="sc-models-box" ${isOpen ? 'open' : ''} ontoggle="if (typeof window !== 'undefined') window.__scModelsOpen = this.open">
      <summary class="sc-models-head" title="Click to view Gemini model availability status">
        <div class="sc-models-head-left">
          <span class="sc-models-title">Model Availability</span>
          <span class="sc-models-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </div>
        <span class="sc-models-count ${availableCount === 0 ? 'is-empty' : ''}">${availableCount} of ${totalCount} available</span>
      </summary>
      <ul class="sc-models-list" id="sc-models-list">
        ${all.map(m => {
          let badgeClass = 'is-available';
          if (m.isZeroQuota || m.status === 'zero_quota' || m.status === 'billing_restricted') {
            badgeClass = 'is-blocked';
          } else if (m.status !== 'available') {
            badgeClass = 'is-limited';
          }

          const countdown = m.remainingSec ? ` <small class="sc-retry-timer">(${m.remainingSec}s)</small>` : '';

          return `
            <li class="sc-model-row" data-model="${m.id}">
              <span class="sc-model-name">${m.label}</span>
              <span class="sc-model-sep">—</span>
              <span class="sc-model-pill ${badgeClass}">
                <i class="sc-dot"></i>${m.statusLabel}${countdown}
              </span>
            </li>
          `;
        }).join('')}
      </ul>
    </details>
  `;
}

let countdownTimer = null;

/**
 * Updates the Model Availability status block in the DOM in real-time.
 */
export function updateModelAvailabilityUI() {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('sc-models-box');
  if (!container) return;

  const all = getAllModelStatuses();
  const availableCount = all.filter(m => m.status === 'available').length;
  const totalCount = all.length;

  const countEl = container.querySelector('.sc-models-count');
  if (countEl) {
    countEl.textContent = `${availableCount} of ${totalCount} available`;
    countEl.classList.toggle('is-empty', availableCount === 0);
  }

  const listEl = container.querySelector('.sc-models-list');
  if (listEl) {
    listEl.innerHTML = all.map(m => {
      let badgeClass = 'is-available';
      if (m.isZeroQuota || m.status === 'zero_quota' || m.status === 'billing_restricted') {
        badgeClass = 'is-blocked';
      } else if (m.status !== 'available') {
        badgeClass = 'is-limited';
      }
      const countdown = m.remainingSec ? ` <small class="sc-retry-timer">(${m.remainingSec}s)</small>` : '';

      return `
        <li class="sc-model-row" data-model="${m.id}">
          <span class="sc-model-name">${m.label}</span>
          <span class="sc-model-sep">—</span>
          <span class="sc-model-pill ${badgeClass}">
            <i class="sc-dot"></i>${m.statusLabel}${countdown}
          </span>
        </li>
      `;
    }).join('');
  }

  // Manage live countdown interval if any model is in countdown
  const hasActiveCooldown = all.some(m => m.remainingSec && m.remainingSec > 0);
  if (hasActiveCooldown && !countdownTimer) {
    countdownTimer = setInterval(() => {
      const active = getAllModelStatuses();
      const stillHasCooldown = active.some(m => m.remainingSec && m.remainingSec > 0);
      updateModelAvailabilityUI();
      if (!stillHasCooldown && countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }, 1000);
  } else if (!hasActiveCooldown && countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}
