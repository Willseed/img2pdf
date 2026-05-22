import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicHeadersPath = resolve(repoRoot, 'public/_headers');
const artifactHeadersPath = resolve(repoRoot, 'dist/img2pdf/browser/_headers');

const requiredHeaders = [
  'X-Frame-Options: SAMEORIGIN',
  'X-Content-Type-Options: nosniff',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
];

const requiredCspDirectives = [
  "default-src 'self'",
  "img-src 'self' data: https: blob:",
  "style-src 'self' 'unsafe-inline' https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https:",
  "worker-src 'self' blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
];

const requiredScriptTokens = ["'unsafe-eval'", "'wasm-unsafe-eval'"];

function displayPath(path) {
  return relative(repoRoot, path);
}

async function readRequiredFile(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Missing ${displayPath(path)}. Run npm run build before checking headers.`);
    }

    throw error;
  }
}

function assertIncludes(text, expected, sourcePath) {
  if (!text.includes(expected)) {
    throw new Error(`${displayPath(sourcePath)} is missing: ${expected}`);
  }
}

function getHeaderValue(text, headerName) {
  const headerPrefix = `${headerName.toLowerCase()}:`;
  const line = text
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.toLowerCase().startsWith(headerPrefix));

  return line?.slice(line.indexOf(':') + 1).trim() ?? '';
}

function normalizeHeaders(text) {
  return text.replace(/\r\n/g, '\n').trim();
}

const publicHeaders = await readRequiredFile(publicHeadersPath);

if (!publicHeaders.trimStart().startsWith('/*')) {
  throw new Error(`${displayPath(publicHeadersPath)} must apply headers to all routes with /*.`);
}

for (const header of requiredHeaders) {
  assertIncludes(publicHeaders, header, publicHeadersPath);
}

const csp = getHeaderValue(publicHeaders, 'Content-Security-Policy');

if (!csp) {
  throw new Error(`${displayPath(publicHeadersPath)} is missing Content-Security-Policy.`);
}

for (const directive of requiredCspDirectives) {
  assertIncludes(csp, directive, publicHeadersPath);
}

const scriptSrc = csp
  .split(';')
  .map((directive) => directive.trim())
  .find((directive) => directive.startsWith('script-src '));

if (!scriptSrc) {
  throw new Error(`${displayPath(publicHeadersPath)} is missing script-src.`);
}

for (const token of requiredScriptTokens) {
  if (!scriptSrc.split(/\s+/).includes(token)) {
    throw new Error(`${displayPath(publicHeadersPath)} script-src is missing ${token}.`);
  }
}

const artifactHeaders = await readRequiredFile(artifactHeadersPath);

if (normalizeHeaders(artifactHeaders) !== normalizeHeaders(publicHeaders)) {
  throw new Error(`${displayPath(artifactHeadersPath)} does not match ${displayPath(publicHeadersPath)}.`);
}

console.log('Deployment headers include WASM CSP directives and are present in the build artifact.');
