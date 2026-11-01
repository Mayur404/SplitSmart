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
