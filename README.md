# img2pdf

Pure frontend Angular 21 app that turns up to 15 selected images into a PDF without uploading image bytes to a server. The UI follows `DESIGN.md`, uses a hash-based build identity instead of a numeric app version, and the GitHub Actions pipeline only deploys after build and Playwright Chromium/WebKit tests pass.

## Development server

To start a local development server, run:

```bash
npm start
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Architecture

- `src/app/app.*`: Apple-inspired upload, preview, progress, download, and share UI.
- `src/app/pdf-builder.service.ts`: file validation, 15-image cap, object URL cleanup, worker orchestration, fallback canvas path, and PDF result state.
- `src/app/pdf.worker.ts`: Web Worker pipeline using `createImageBitmap`, `OffscreenCanvas`, and `pdf-lib`.
- `src/app/pdf-worker.types.ts`: typed protocol for worker messages.
- `scripts/write-build-info.mjs`: writes `src/app/build-info.ts` from `GITHUB_SHA` or the local git hash; the visible app version is a hash, not a numeric release.
- `.github/workflows/ci.yml`: build, Playwright Chromium/WebKit tests, then GitHub Pages deploy gated by successful CI.

## Building

To build the project run:

```bash
npm run build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

For CI-style production builds with a hash build identity:

```bash
npm run build:ci
```

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
npm test
```

## Running end-to-end tests

End-to-end tests use [Playwright](https://playwright.dev/) and cover Chromium and WebKit. Install browsers once:

```bash
npx playwright install chromium webkit
```

Then run:

```bash
npm run test:e2e
```

To run one project:

```bash
npm run e2e -- e2e/img2pdf.spec.ts --project=chromium
```

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
