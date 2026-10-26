# SplitSmart React

Advanced single-theme React/Vite application for group bill splitting and peer-to-peer settlement planning.

## Run locally

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run lint
npm run build
```

## Input validation

See [VALIDATION_GUIDE.md](./VALIDATION_GUIDE.md) for the field-by-field validation map. Validation rules live in `src/legacy/validation.js`, field declarations live in the relevant screen templates under `src/legacy/views/` and `src/legacy/components/Dialogs.jsx`, and validation styling is in `src/styles/validation.css`.

## App controller

The application workflow controller is `src/controller/appController.jsx`. It imports the screen components from `src/legacy/`; the old duplicate JavaScript controller has been removed.
