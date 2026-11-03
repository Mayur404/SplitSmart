/**
 * Gemini receipt-scanning configuration.
 *
 * The key is read at build time from the Vite environment (see .env.example):
 *   VITE_GEMINI_API_KEY=your_api_key_here
 *
 * IMPORTANT: every `VITE_`-prefixed variable is inlined into the browser bundle.
 * The key is therefore visible to anyone who can load the site — it is NOT secret.
 * SplitSmart calls Gemini directly from the browser (no backend), so restrict the key
 * in Google AI Studio / Cloud Console (HTTP referrer allow-list + quota cap).
 */
export const GEMINI_API_KEY = String(import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
export const GEMINI_CONFIGURED = GEMINI_API_KEY.length > 0;

/**
 * Structured Gemini Model Registry for Receipt / Bill Vision Extraction.
 * Only includes models supporting image-input and text-output capabilities.
 * TTS, Live Audio, transcription, embedding, robotics and image-gen models are excluded.
 */
export const GEMINI_MODELS = [
  // --- Stable Models ---
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', category: 'stable' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', category: 'stable' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', category: 'stable' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', category: 'stable' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', category: 'stable' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', category: 'stable' },

  // --- Preview Models ---
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', category: 'preview' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview', category: 'preview' },

  // --- Compatibility Models ---
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', category: 'compatibility' }
];

export const STABLE_MODEL_IDS = GEMINI_MODELS.filter(m => m.category === 'stable').map(m => m.id);
export const PREVIEW_MODEL_IDS = GEMINI_MODELS.filter(m => m.category === 'preview').map(m => m.id);

/**
 * Default models participating in parallel racing.
 * Includes both stable and preview general-purpose multimodal models with vision support.
 */
export const DEFAULT_RACING_MODELS = GEMINI_MODELS.map(m => m.id);

/**
 * Get user-friendly label for a model ID.
 */
export function getModelLabel(modelId) {
  if (!modelId) return 'Gemini';
  const found = GEMINI_MODELS.find(m => m.id === modelId);
  if (found) return found.label;
  return modelId
    .replace(/^models\//, '')
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
