/// <reference lib="webworker" />

import { PDFDocument } from 'pdf-lib';
import { MainToWorkerMessage, WorkerToMainMessage } from './pdf-worker.types';

const cancelledJobs = new Set<string>();

addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  if (message.type === 'CANCEL_JOB') {
    cancelledJobs.add(message.jobId);
    return;
  }

  if (message.type === 'START_JOB') {
    void processJob(message);
  }
});

async function processJob(
  message: Extract<MainToWorkerMessage, { type: 'START_JOB' }>,
): Promise<void> {
  const start = performance.now();
  const originalSizeBytes = message.buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);

  try {
    const pdfDoc = await PDFDocument.create();
    const [pageWidth, pageHeight] = message.options.pageSize;

    for (let index = 0; index < message.buffers.length; index += 1) {
      if (cancelledJobs.has(message.jobId)) {
        cancelledJobs.delete(message.jobId);
        post({ type: 'CANCELLED', jobId: message.jobId });
        return;
      }

      postProgress(message.jobId, 'decode', index, message.buffers.length, 5);
      const inputBlob = new Blob([message.buffers[index]], { type: message.mimeTypes[index] });
      const bitmap = await createImageBitmap(inputBlob, { imageOrientation: 'from-image' });

      postProgress(message.jobId, 'resize', index, message.buffers.length, 35);
      const resizedBuffer = await resizeBitmap(
        bitmap,
        message.options.maxImageDimension,
        message.options.jpegQuality,
      );
      bitmap.close();

      postProgress(message.jobId, 'embed', index, message.buffers.length, 65);
      const image = await pdfDoc.embedJpg(resizedBuffer);
      const page = pdfDoc.addPage(message.options.pageSize);
      const fit = image.scaleToFit(pageWidth, pageHeight);

      page.drawImage(image, {
        x: (pageWidth - fit.width) / 2,
        y: (pageHeight - fit.height) / 2,
        width: fit.width,
        height: fit.height,
      });
    }

    postProgress(message.jobId, 'serialize', message.buffers.length, message.buffers.length, 95);
    const pdfBytes = await pdfDoc.save();
    const pdfBuffer = pdfBytes.buffer as ArrayBuffer;

    self.postMessage(
      {
        type: 'COMPLETE',
        jobId: message.jobId,
        pdfBuffer,
        stats: {
          durationMs: performance.now() - start,
          imageCount: message.buffers.length,
          originalSizeBytes,
          pdfSizeBytes: pdfBuffer.byteLength,
        },
      } satisfies WorkerToMainMessage,
      [pdfBuffer],
    );
  } catch (error) {
    post({
      type: 'ERROR',
      jobId: message.jobId,
      errorCode: 'PDF_CREATION_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resizeBitmap(
  bitmap: ImageBitmap,
  maxDimension: number,
  jpegQuality: number,
): Promise<ArrayBuffer> {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new Error('Could not create worker canvas.');
  }

  context.drawImage(bitmap, 0, 0, width, height);
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: jpegQuality });
  return blob.arrayBuffer();
}

function post(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

function postProgress(
  jobId: string,
  phase: 'decode' | 'resize' | 'embed' | 'serialize',
  current: number,
  total: number,
  phaseBase: number,
): void {
  const progressPct = Math.min(99, Math.round(phaseBase + (current / Math.max(total, 1)) * 25));
  post({ type: 'PROGRESS', jobId, phase, current, total, progressPct });
}
