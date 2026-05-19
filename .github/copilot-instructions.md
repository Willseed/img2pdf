# Copilot instructions

## Repository state

This repository currently has no application source files, README, package metadata, build scripts, test suite, lint configuration, or other assistant instruction files. Treat it as an uninitialized Angular 21 website project and avoid assuming any additional language, framework, or toolchain beyond Angular 21 and the Playwright testing requirements below.

## Build, test, and lint commands

- Install dependencies: `npm ci`
- Start local dev server: `npm start`
- Production build: `npm run build`
- CI production build with hash-based app version: `npm run build:ci`
- Unit tests: `npm test`
- Unit tests in watch mode: `npm run test:watch`
- End-to-end tests after building: `npm run test:e2e`
- Run a single Playwright test: `npm run e2e -- e2e/img2pdf.spec.ts --project=chromium`
- No lint command is configured yet.

## Architecture

Angular 21 standalone app for pure-frontend image-to-PDF conversion. `App` owns the presentation, `PdfBuilderService` owns validation/state/worker orchestration, `pdf.worker.ts` performs mobile-safe image resizing and `pdf-lib` PDF generation, and `pdf-worker.types.ts` defines the main-thread/worker protocol. Build identity is displayed from `src/app/build-info.ts`, generated from the current git hash by `scripts/write-build-info.mjs`.

## Key conventions

- Keep this file aligned with any future README, CONTRIBUTING guide, package metadata, and assistant configuration files.
- When adding a project scaffold or changing tooling, update the commands above in the same change.
- All web design styling must follow `DESIGN.md` as the source of truth for visual direction, layout, typography, colors, spacing, and interaction patterns.
- This website must be developed with Angular 21.
- Testing must use Playwright and cover Chromium and WebKit.
- Deployment is allowed only after GitHub CI/CD has completed successfully.
