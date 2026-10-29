/** Build-time Vite environment configuration. */
const viteEnvironment = import.meta.env || {};

export const GEMINI_API_KEY = (viteEnvironment.VITE_GEMINI_API_KEY || '').trim();
export const GEMINI_CONFIGURED = GEMINI_API_KEY.length > 0;
