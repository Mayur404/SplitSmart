# SplitSmart React Migration

This package introduces a Vite + React entry point while preserving SplitSmart's original styles, assets, local-storage format, financial algorithms, receipt scanning, UPI QR generation, self-claim links, and existing workflows.

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL printed by Vite.

## Production build
```bash
npm run build
npm run preview
```

## Architecture and migration status
- `src/main.jsx`: React root and stylesheet imports.
- `src/App.jsx`: React application entry and compatibility shell.
- `src/legacy/`: preserved original ES modules, including state persistence, exact-paise allocation, UPI/QR, sharing, receipt scanning, motion, and routing/event orchestration.
- `public/`: original CSS and bundled vendor libraries.

**Important transparency note:** This is a compatibility-first React migration scaffold, not a complete conversion of every dynamic view into JSX yet. The original application modules still render their dynamic screens imperatively into the `#app` mount point. This preserves existing behavior during migration but does not yet satisfy a strict requirement that all UI rendering be React-owned. Continue by converting view renderers and event handling in `src/legacy/app.js` into React pages/components and removing the compatibility shell only after feature parity is verified.

The app is client-side and does not require a backend. Receipt scanning via Gemini is configured with an environment variable (see below) and needs internet access.


## JSX migration update

All application source modules under `src/` now use the `.jsx` extension, including the former `legacy` modules. Relative imports were updated and checked for missing local targets. The former vanilla modules are retained as `.jsx` modules to preserve business rules and browser integrations while the remaining UI migration proceeds.

**Important:** changing a module extension does not by itself convert imperative DOM rendering to React. The current application still has legacy `innerHTML` rendering and delegated DOM event handlers inside `src/legacy/app.jsx`; the dynamic pages have not yet all been rewritten as React component trees. This package therefore should not be described as a completed JSX-only React architecture yet.

Run locally with:

```bash
npm install
npm run dev
```

Build with `npm run build`. Dependency installation and production build could not be verified in this environment because the install attempt did not finish.

## Google Apps Script + Google Sheets claim collection

The project now includes a FormBridge JSONP bridge for creating a form/key mapping, generating a customer key, submitting claim details to Sheets, and polling owner responses every 10 seconds. Setup instructions and the Apps Script source are in:

- `GOOGLE_APPS_SCRIPT_SETUP.md`
- `google-apps-script/Code.gs`
- `google-apps-script/Index.html`
- `google-apps-script/appsscript.json`

Before testing, set the deployed Apps Script `/exec` URL in `src/config/formBridge.jsx` and configure the spreadsheet ID in `google-apps-script/Code.gs`. The React app build has not been verified in this environment because dependency installation timed out.


## Gemini receipt scanning — environment configuration

The receipt scanner reads its API key from a Vite environment variable. There is no key field in Settings and
nothing is saved to `localStorage` (an older saved key is deleted automatically on first load).

### Local development
```bash
cp .env.example .env        # .env is git-ignored
# edit .env:
VITE_GEMINI_API_KEY=your_api_key_here
npm run dev                 # restart the dev server after changing .env
```

### Production / deployment
Vite replaces `import.meta.env.VITE_GEMINI_API_KEY` **at build time**, so the variable must exist when
`npm run build` runs, not just when the site is served:

- **Netlify / Vercel / Cloudflare Pages / GitHub Actions:** add `VITE_GEMINI_API_KEY` in the project's
  *Environment variables* settings, then trigger a new build.
- **Manual builds:** `VITE_GEMINI_API_KEY=your_key npm run build`, then upload `dist/`.
- If the variable is missing or empty, the app still works. Receipt image selection, drag-and-drop, and preview remain available; the **Scan receipt** button stays disabled until the key is configured (manual bill entry is unaffected).

### Security: this key is **not secret**
Every `VITE_`-prefixed variable is inlined into the public JavaScript bundle. Anyone who can load the site can
read the key in the page source or network tab. SplitSmart calls Gemini directly from the browser (no backend),
and this change keeps that architecture. To limit abuse:

1. In Google AI Studio / Google Cloud Console, restrict the key by **HTTP referrer** to your site's domain(s).
2. Restrict it to the **Generative Language API** only.
3. Set a low **quota / budget alert**, and rotate the key if it is ever abused.
4. Never commit `.env`; only `.env.example` (empty placeholder) is tracked.

Moving the key out of the browser would require a server-side proxy, which is intentionally not part of this project.

### Files involved
- `src/config/gemini.jsx` — reads `VITE_GEMINI_API_KEY`, exposes `GEMINI_API_KEY` / `GEMINI_CONFIGURED`.
- `src/legacy/vision.jsx` — unchanged Gemini request, prompt, parsing and model-fallback logic.
- `.env.example`, `.gitignore` — placeholder and exclusion.
