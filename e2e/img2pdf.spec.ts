import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';

const PNG_FIXTURE = createPngFixture();

function imagePayloads(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    name: `fixture-${String(index + 1).padStart(2, '0')}.png`,
    mimeType: 'image/png',
    buffer: PNG_FIXTURE,
  }));
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
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('accepts exactly 15 images', async ({ page }) => {
    await page.locator('#image-input').setInputFiles(imagePayloads(15));

    await expect(page.locator('.preview-card')).toHaveCount(15);
    await expect(page.getByText('15/15 selected')).toBeVisible();
  });

  test('rejects images above the 15 file cap', async ({ page }) => {
    await page.locator('#image-input').setInputFiles(imagePayloads(16));

    await expect(page.locator('.preview-card')).toHaveCount(15);
    await expect(page.getByRole('alert')).toContainText('最多只能選擇 15 張圖片');
  });

  test('rejects HEIC images with guidance', async ({ page }) => {
    await page.locator('#image-input').setInputFiles({
      name: 'camera-photo.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from('not decoded in browser-only mode'),
    });

    await expect(page.locator('.preview-card')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('HEIC/HEIF');
  });

  test('generates a 15 page PDF download', async ({ page }, testInfo) => {
    await page.locator('#image-input').setInputFiles(imagePayloads(15));
    await page.getByRole('button', { name: 'Generate PDF' }).click();

    await expect(page.getByText('PDF is ready.')).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Download' }).click();
    const download = await downloadPromise;
    const pdfPath = join(testInfo.outputDir, 'img2pdf-output.pdf');
    await download.saveAs(pdfPath);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    expect(readFileSync(pdfPath).subarray(0, 5).toString('ascii')).toBe('%PDF-');

    const pdf = await PDFDocument.load(readFileSync(pdfPath));
    expect(pdf.getPageCount()).toBe(15);
  });
});
