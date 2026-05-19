# Copilot instructions

## Repository state

This repository is a pure-frontend Angular 21 app for browser-only image-to-PDF conversion. Preserve the existing Angular, Vitest, Playwright, GitHub Pages, and hash-based build identity setup unless a task explicitly asks to change it.

## Build, test, and lint commands

- Install dependencies: `npm ci`
- Start local dev server: `npm start`
- Production build: `npm run build`
- CI production build with hash-based app version: `npm run build:ci`
- Unit tests: `npm test`
- Unit tests in watch mode: `npm run test:watch`
- End-to-end tests after building: `npm run test:e2e`
- Run a single Playwright test: `npm run e2e -- e2e/img2pdf.spec.ts --project=chromium`
- No dedicated i18n extraction/translation command is configured; update `src/app/i18n.ts` for copy changes.
- No lint command is configured yet.

## Architecture

Angular 21 standalone app for pure-frontend image-to-PDF conversion. `App` owns the single-viewport upload, preview, progress, download, and share presentation. `src/app/i18n.ts` centralizes all Traditional Chinese (`zh-TW`) copy for the app, PDF service, and worker. `PdfBuilderService` owns validation/state/worker orchestration, `pdf.worker.ts` performs mobile-safe image resizing and `pdf-lib` PDF generation, and `pdf-worker.types.ts` defines the main-thread/worker protocol. Build identity is displayed from `src/app/build-info.ts`, generated from the current git hash by `scripts/write-build-info.mjs`.

## Key conventions

- Keep this file aligned with any future README, CONTRIBUTING guide, package metadata, and assistant configuration files.
- When adding a project scaffold or changing tooling, update the commands above in the same change.
- All web design styling must follow `DESIGN.md` as the source of truth for visual direction, layout, typography, colors, spacing, and interaction patterns.
- This website must be developed with Angular 21.
- Keep user-facing copy in Traditional Chinese (`zh-TW`) via `src/app/i18n.ts`; do not hard-code UI/service/worker strings elsewhere.
- Keep the desktop user flow to one page/one viewport; long preview lists should scroll within the preview panel/card, not the document.
- Testing must use Playwright and cover Chromium and WebKit.
- Deployment is allowed only after GitHub CI/CD has completed successfully.
