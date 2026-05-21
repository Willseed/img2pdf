/// <reference lib="webworker" />

import type mupdfDefault from 'mupdf';
import type { Buffer as MuPdfBuffer, Document as MuPdfDocument } from 'mupdf';
import { ZH_TW } from './i18n';
import {
  MainToUnlockWorkerMessage,
  PdfUnlockErrorCode,
  PdfUnlockPhase,
  StartUnlockMessage,
  UnlockWorkerToMainMessage,
} from './pdf-unlock-worker.types';

const COPY = ZH_TW.unlockWorker;
const SAVE_OPTIONS = 'decrypt,garbage=deduplicate,compress=yes';

const cancelledJobs = new Set<string>();
let mupdfPromise: Promise<typeof mupdfDefault> | null = null;

class PdfUnlockWorkerError extends Error {
  constructor(
    readonly code: PdfUnlockErrorCode,
    message: string,
  ) {
    super(message);
  }
}

addEventListener('message', (event: MessageEvent<MainToUnlockWorkerMessage>) => {
  const message = event.data;

  if (message.type === 'CANCEL_UNLOCK') {
    cancelledJobs.add(message.jobId);
    return;
  }

  if (message.type === 'START_UNLOCK') {
    void processJob(message);
  }
});

async function processJob(message: StartUnlockMessage): Promise<void> {
  const start = performance.now();
  let document: MuPdfDocument | null = null;
  let output: MuPdfBuffer | null = null;

  try {
    throwIfCancelled(message.jobId);
    postProgress(message.jobId, 'loading', 8);
    const mupdf = await loadMuPdf();

    throwIfCancelled(message.jobId);
    postProgress(message.jobId, 'opening', 24);
    document = mupdf.Document.openDocument(message.buffer, 'application/pdf');
    const pdf = document.asPDF();
    if (!pdf) {
      throw new PdfUnlockWorkerError('UNSUPPORTED_FORMAT', COPY.unsupportedFormat);
    }

    const encryption = document.getMetaData(mupdf.Document.META_ENCRYPTION);
    if (!isEncrypted(encryption)) {
      throw new PdfUnlockWorkerError('UNENCRYPTED_PDF', COPY.unencryptedPdf);
    }

    const needsPassword = document.needsPassword();
    if (needsPassword) {
      if (!message.password) {
        throw new PdfUnlockWorkerError('MISSING_PASSWORD', COPY.missingPassword);
      }

      postProgress(message.jobId, 'authenticating', 45);
      const authResult = document.authenticatePassword(message.password);
      if ((authResult & 6) === 0) {
        throw new PdfUnlockWorkerError('WRONG_PASSWORD', COPY.wrongPassword);
      }
    }

    throwIfCancelled(message.jobId);
    const pageCount = document.countPages();
    postProgress(message.jobId, 'decrypting', 68);

    throwIfCancelled(message.jobId);
    postProgress(message.jobId, 'saving', 88);
    output = pdf.saveToBuffer(SAVE_OPTIONS);
    const pdfBytes = new Uint8Array(output.asUint8Array());
    const pdfBuffer = pdfBytes.buffer;

    self.postMessage(
      {
        type: 'UNLOCK_COMPLETE',
        jobId: message.jobId,
        pdfBuffer,
        stats: {
          durationMs: performance.now() - start,
          pageCount,
          originalSizeBytes: message.buffer.byteLength,
          pdfSizeBytes: pdfBuffer.byteLength,
          wasPasswordRequired: needsPassword,
        },
      } satisfies UnlockWorkerToMainMessage,
      [pdfBuffer],
    );
  } catch (error) {
    if (isCancellation(error)) {
      cancelledJobs.delete(message.jobId);
      post({ type: 'UNLOCK_CANCELLED', jobId: message.jobId });
      return;
    }

    if (error instanceof PdfUnlockWorkerError) {
      post({
        type: 'UNLOCK_ERROR',
        jobId: message.jobId,
        errorCode: error.code,
        message: error.message,
      });
      return;
    }

    post({
      type: 'UNLOCK_ERROR',
      jobId: message.jobId,
      errorCode: 'CORRUPT_PDF',
      message: COPY.corruptPdf,
    });
  } finally {
    output?.destroy();
    document?.destroy();
  }
}

async function loadMuPdf(): Promise<typeof mupdfDefault> {
  if (!mupdfPromise) {
    configureMuPdfWasmAsset();
    mupdfPromise = import('mupdf').then((module) => module.default);
  }

  return mupdfPromise;
}

function configureMuPdfWasmAsset(): void {
  const globalWithMuPdf = globalThis as typeof globalThis & {
    $libmupdf_wasm_Module?: {
      locateFile?: (path: string, prefix: string) => string;
    };
  };
  globalWithMuPdf.$libmupdf_wasm_Module = {
    ...(globalWithMuPdf.$libmupdf_wasm_Module ?? {}),
    locateFile: (path: string) => {
      if (path.endsWith('.wasm')) {
        return new URL(`assets/mupdf/${path}`, self.location.href).href;
      }

      return path;
    },
  };
}

function isEncrypted(encryption: string | undefined): boolean {
  return Boolean(encryption && encryption !== 'None');
}

function throwIfCancelled(jobId: string): void {
  if (cancelledJobs.has(jobId)) {
    throw new PdfUnlockWorkerError('CANCELLED_BY_USER', COPY.cancelled);
  }
}

function isCancellation(error: unknown): boolean {
  return error instanceof PdfUnlockWorkerError && error.code === 'CANCELLED_BY_USER';
}

function post(message: UnlockWorkerToMainMessage): void {
  self.postMessage(message);
}

function postProgress(jobId: string, phase: PdfUnlockPhase, progressPct: number): void {
  post({ type: 'UNLOCK_PROGRESS', jobId, phase, progressPct });
}
