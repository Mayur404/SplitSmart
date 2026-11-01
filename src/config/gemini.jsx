export const GEMINI_API_KEY = String(import.meta.env.VITE_GEMINI_API_KEY ?? '').trim();
export const GEMINI_CONFIGURED = GEMINI_API_KEY.length > 0;
