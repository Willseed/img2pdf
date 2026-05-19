import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { ZH_TW } from '../src/app/i18n';

const PNG_FIXTURE = createPngFixture();
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

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

    await expect(page.getByText(ZH_TW.app.actions.ready)).toBeVisible({ timeout: 30_000 });

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
});
