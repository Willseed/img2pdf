import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import type mupdfDefault from 'mupdf';
import { ZH_TW } from '../src/app/i18n';

const PNG_FIXTURE = createPngFixture();
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };
const UNLOCK_PASSWORD = 'correct-horse-battery-staple';
const OWNER_PASSWORD = 'synthetic-owner-password';
let mupdfPromise: Promise<typeof mupdfDefault> | null = null;
let plainPdfFixturePromise: Promise<Buffer> | null = null;
let encryptedPdfFixturePromise: Promise<Buffer> | null = null;

function imagePayloads(count: number, nameFactory = defaultImageName) {
  return Array.from({ length: count }, (_, index) => ({
    name: nameFactory(index),
    mimeType: 'image/png',
    buffer: PNG_FIXTURE,
  }));
}

function defaultImageName(index: number): string {
  return `fixture-${String(index + 1).padStart(2, '0')}.png`;
}

function longImageName(index: number): string {
  return [
    `fixture-${String(index + 1).padStart(2, '0')}`,
    `${'very-long-preview-name-'.repeat(5)}.png`,
  ].join('-');
}

async function openApp(page: Page, viewport?: { width: number; height: number }) {
  if (viewport) {
    await page.setViewportSize(viewport);
  }
  await page.goto('/');
}

async function selectUnlockTab(page: Page) {
  const imageTab = page.getByRole('tab', { name: new RegExp(ZH_TW.app.tabs.image) });
  const unlockTab = page.getByRole('tab', { name: new RegExp(ZH_TW.app.tabs.unlock) });

  await expect(imageTab).toHaveAttribute('aria-selected', 'true');
  await unlockTab.click();
  await expect(unlockTab).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: ZH_TW.app.unlockHero.title })).toBeVisible();
}

async function uploadUnlockPdf(page: Page, buffer: Buffer, name: string) {
  await page.locator('#unlock-input').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer,
  });
  await expect(page.getByText(ZH_TW.app.unlock.details.ready)).toBeVisible();
}

async function unlockSelectedPdf(page: Page, password: string) {
  await page.getByRole('textbox', { name: ZH_TW.app.unlock.actions.passwordLabel }).fill(password);
  await page.getByRole('button', { name: ZH_TW.app.unlock.actions.unlock }).click();
}

async function downloadUnlockedPdf(
  page: Page,
  testOutputDir: string,
  fileName: string,
): Promise<Buffer> {
  await expect(page.locator('.download-panel')).toContainText(ZH_TW.app.unlock.actions.ready, {
    timeout: 60_000,
  });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: ZH_TW.app.unlock.actions.download }).click();
  const download = await downloadPromise;
  const pdfPath = join(testOutputDir, fileName);
  await download.saveAs(pdfPath);

  expect(download.suggestedFilename()).toMatch(/-unlocked\.pdf$/);
  return readFileSync(pdfPath);
}

async function expectDocumentFitsViewport(page: Page) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      documentScrollHeight: root.scrollHeight,
      bodyScrollHeight: body.scrollHeight,
      documentScrollWidth: root.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
    };
  });

  expect(metrics.documentScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.bodyScrollHeight).toBeLessThanOrEqual(metrics.viewportHeight + 2);
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2);
}

async function expectPreviewCardsFitPanel(page: Page) {
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('.preview-panel');
    const list = document.querySelector('.preview-list');

    if (!(panel instanceof HTMLElement) || !(list instanceof HTMLElement)) {
      throw new Error('Preview panel was not rendered.');
    }

    const panelRect = panel.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const cards = Array.from(list.querySelectorAll('.preview-card')).map((card) => {
      if (!(card instanceof HTMLElement)) {
        throw new Error('Preview card was not rendered.');
      }

      const rect = card.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        clientWidth: card.clientWidth,
        scrollWidth: card.scrollWidth,
      };
    });

    return {
      panelLeft: panelRect.left,
      panelRight: panelRect.right,
      listLeft: listRect.left,
      listRight: listRect.right,
      listClientWidth: list.clientWidth,
      listScrollWidth: list.scrollWidth,
      cards,
    };
  });

  expect(layout.listLeft).toBeGreaterThanOrEqual(layout.panelLeft - 2);
  expect(layout.listRight).toBeLessThanOrEqual(layout.panelRight + 2);
  expect(layout.listScrollWidth).toBeLessThanOrEqual(layout.listClientWidth + 2);
  for (const card of layout.cards) {
    expect(card.left).toBeGreaterThanOrEqual(layout.listLeft - 2);
    expect(card.right).toBeLessThanOrEqual(layout.listRight + 2);
    expect(card.width).toBeLessThanOrEqual(layout.listClientWidth + 2);
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth + 2);
  }
}

async function expectActionPanelNotViewportFixed(page: Page) {
  const actionPanel = page.locator('.action-panel');
  await expect(actionPanel).toBeVisible();

  const position = await actionPanel.evaluate((element) => getComputedStyle(element).position);
  expect(position).not.toBe('fixed');
}

async function scrollActionIntoView(action: Locator) {
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeInViewport();
}

function createPngFixture(): Buffer {
  const width = 8;
  const height = 8;
  const rowLength = 1 + width * 4;
  const raw = Buffer.alloc(rowLength * height);

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * rowLength;
    raw[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + 1 + x * 4;
      raw[offset] = 0;
      raw[offset + 1] = 102;
      raw[offset + 2] = 204;
      raw[offset + 3] = 255;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND'),
  ]);
}

function pngChunk(type: string, data = Buffer.alloc(0)): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function createPlainPdfFixture(): Promise<Buffer> {
  if (!plainPdfFixturePromise) {
    plainPdfFixturePromise = (async () => {
      const pdf = await PDFDocument.create();
      const page = pdf.addPage([240, 180]);
      page.drawText('Synthetic img2pdf unlock fixture', {
        x: 24,
        y: 90,
        size: 12,
      });
      return Buffer.from(await pdf.save());
    })();
  }

  return plainPdfFixturePromise;
}

async function createEncryptedPdfFixture(): Promise<Buffer> {
  if (!encryptedPdfFixturePromise) {
    encryptedPdfFixturePromise = (async () => {
      const mupdf = await loadMuPdf();
      const plainPdf = await createPlainPdfFixture();
      const document = mupdf.Document.openDocument(plainPdf, 'application/pdf');
      const pdf = document.asPDF();
      if (!pdf) {
        document.destroy();
        throw new Error('Synthetic fixture did not open as a PDF.');
      }

      const encrypted = pdf.saveToBuffer({
        encrypt: 'aes-256',
        'user-password': UNLOCK_PASSWORD,
        'owner-password': OWNER_PASSWORD,
      });
      try {
        return Buffer.from(encrypted.asUint8Array());
      } finally {
        encrypted.destroy();
        document.destroy();
      }
    })();
  }

  return encryptedPdfFixturePromise;
}

async function expectPdfOpensWithoutPassword(pdfBytes: Buffer) {
  expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');

  const mupdf = await loadMuPdf();
  const document = mupdf.Document.openDocument(pdfBytes, 'application/pdf');
  try {
    expect(document.needsPassword()).toBe(false);
    expect(document.getMetaData(mupdf.Document.META_ENCRYPTION) ?? 'None').toBe('None');
    expect(document.countPages()).toBe(1);
  } finally {
    document.destroy();
  }

  const pdf = await PDFDocument.load(pdfBytes);
  expect(pdf.getPageCount()).toBe(1);
}

async function loadMuPdf(): Promise<typeof mupdfDefault> {
  if (!mupdfPromise) {
    mupdfPromise = import('mupdf').then((module) => module.default);
  }

  return mupdfPromise;
}

test.describe('img2pdf browser workflow', () => {
  test('accepts exactly 15 images', async ({ page }) => {
    await openApp(page);
    await page.locator('#image-input').setInputFiles(imagePayloads(15));

    await expect(page.locator('.preview-card')).toHaveCount(15);
    await expect(page.getByText(ZH_TW.app.upload.counter(15, 15))).toBeVisible();
    await expect(page.getByRole('list', { name: ZH_TW.app.preview.listLabel })).toBeVisible();
    await expect(page.getByText(ZH_TW.app.preview.page(15))).toBeVisible();
  });

  test('keeps the desktop workflow in one viewport and contains preview cards', async ({
    page,
  }) => {
    await openApp(page, DESKTOP_VIEWPORT);
    await expectDocumentFitsViewport(page);

    await page.locator('#image-input').setInputFiles(imagePayloads(15, longImageName));

    await expect(page.locator('.preview-card')).toHaveCount(15);
    await expectDocumentFitsViewport(page);
    await expectPreviewCardsFitPanel(page);
  });

  test('keeps the mobile create and download action visible in the viewport', async ({
    page,
  }, testInfo) => {
    await openApp(page, MOBILE_VIEWPORT);
    await expectDocumentFitsViewport(page);
    await page.locator('#image-input').setInputFiles(imagePayloads(3, longImageName));

    const actionPanel = page.locator('.action-panel');
    const generateButton = page.getByRole('button', { name: ZH_TW.app.actions.generate });

    await expectActionPanelNotViewportFixed(page);
    await expect(actionPanel).toBeVisible();
    await expect(generateButton).toBeVisible();
    await expectDocumentFitsViewport(page);

    await scrollActionIntoView(generateButton);
    await expectDocumentFitsViewport(page);

    await generateButton.click();

    const downloadLink = page.getByRole('link', { name: ZH_TW.app.actions.download });
    await expect(downloadLink).toBeVisible({ timeout: 30_000 });
    await scrollActionIntoView(downloadLink);
    await expectDocumentFitsViewport(page);

    const downloadPromise = page.waitForEvent('download');
    await downloadLink.click();
    const download = await downloadPromise;
    const pdfPath = join(testInfo.outputDir, 'mobile-created.pdf');
    await download.saveAs(pdfPath);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test('rejects images above the 15 file cap', async ({ page }) => {
    await openApp(page);
    await page.locator('#image-input').setInputFiles(imagePayloads(16));

    await expect(page.locator('.preview-card')).toHaveCount(15);
    await expect(page.getByText(ZH_TW.app.upload.counter(15, 15))).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(ZH_TW.service.maxImages(15, 1));
  });

  test('rejects HEIC images with zh-TW guidance', async ({ page }) => {
    await openApp(page);
    await page.locator('#image-input').setInputFiles({
      name: 'camera-photo.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('not decoded in browser-only mode'),
    });

    await expect(page.locator('.preview-card')).toHaveCount(0);
    await expect(page.getByText(ZH_TW.app.preview.empty)).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      ZH_TW.service.rejectedHeic('camera-photo.heic'),
    );
  });

  test('generates a 15 page PDF download', async ({ page }, testInfo) => {
    await openApp(page);
    await page.locator('#image-input').setInputFiles(imagePayloads(15));
    await page.getByRole('button', { name: ZH_TW.app.actions.generate }).click();

    await expect(page.locator('.download-panel')).toContainText(ZH_TW.app.actions.ready, {
      timeout: 30_000,
    });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: ZH_TW.app.actions.download }).click();
    const download = await downloadPromise;
    const pdfPath = join(testInfo.outputDir, 'img2pdf-output.pdf');
    await download.saveAs(pdfPath);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(pdfPath).subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const pdf = await PDFDocument.load(readFileSync(pdfPath));
    expect(pdf.getPageCount()).toBe(15);
  });

  test('switches tabs and unlocks a password-protected PDF download', async ({
    page,
  }, testInfo) => {
    await openApp(page);
    await selectUnlockTab(page);
    await uploadUnlockPdf(page, await createEncryptedPdfFixture(), 'locked-synthetic.pdf');
    await unlockSelectedPdf(page, UNLOCK_PASSWORD);

    const unlockedPdf = await downloadUnlockedPdf(
      page,
      testInfo.outputDir,
      'unlocked-synthetic.pdf',
    );

    await expectPdfOpensWithoutPassword(unlockedPdf);
  });

  test('shows a recoverable wrong password error for encrypted PDFs', async ({
    page,
  }, testInfo) => {
    await openApp(page);
    await selectUnlockTab(page);
    await uploadUnlockPdf(page, await createEncryptedPdfFixture(), 'recoverable-password.pdf');
    await unlockSelectedPdf(page, 'wrong-password');

    await expect(page.getByRole('alert')).toContainText(ZH_TW.unlockWorker.wrongPassword, {
      timeout: 60_000,
    });
    await expect(page.getByRole('button', { name: ZH_TW.app.unlock.actions.unlock })).toBeEnabled();
    await expect(page.getByText('recoverable-password.pdf')).toBeVisible();

    await unlockSelectedPdf(page, UNLOCK_PASSWORD);
    const unlockedPdf = await downloadUnlockedPdf(
      page,
      testInfo.outputDir,
      'recoverable-unlocked.pdf',
    );
    await expectPdfOpensWithoutPassword(unlockedPdf);
  });

  test('reports unencrypted PDFs without replacing the selected file', async ({ page }) => {
    await openApp(page);
    await selectUnlockTab(page);
    await uploadUnlockPdf(page, await createPlainPdfFixture(), 'already-open.pdf');
    await unlockSelectedPdf(page, '');

    await expect(page.getByRole('alert')).toContainText(ZH_TW.unlockWorker.unencryptedPdf, {
      timeout: 60_000,
    });
    await expect(page.getByText('already-open.pdf')).toBeVisible();
    await expect(page.getByRole('button', { name: ZH_TW.app.unlock.actions.unlock })).toBeEnabled();
    await expect(page.getByRole('link', { name: ZH_TW.app.unlock.actions.download })).toHaveCount(
      0,
    );
  });

  test('keeps the mobile unlock tab and download action usable', async ({ page }, testInfo) => {
    await openApp(page, MOBILE_VIEWPORT);

    const unlockTab = page.getByRole('tab', { name: new RegExp(ZH_TW.app.tabs.unlock) });
    await expect(unlockTab).toBeVisible();
    await expect(unlockTab).toBeInViewport();
    await selectUnlockTab(page);
    await expectActionPanelNotViewportFixed(page);
    await uploadUnlockPdf(page, await createEncryptedPdfFixture(), 'mobile-locked.pdf');

    const unlockButton = page.getByRole('button', { name: ZH_TW.app.unlock.actions.unlock });
    await expect(unlockButton).toBeVisible();
    await scrollActionIntoView(unlockButton);

    await unlockSelectedPdf(page, UNLOCK_PASSWORD);

    const downloadLink = page.getByRole('link', { name: ZH_TW.app.unlock.actions.download });
    await expect(downloadLink).toBeVisible({ timeout: 60_000 });
    await scrollActionIntoView(downloadLink);
    await expectDocumentFitsViewport(page);

    const unlockedPdf = await downloadUnlockedPdf(page, testInfo.outputDir, 'mobile-unlocked.pdf');
    await expectPdfOpensWithoutPassword(unlockedPdf);
  });
});
