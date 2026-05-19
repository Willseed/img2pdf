import { Injectable, computed, inject, OnDestroy, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import {
  CompleteMessage,
  ImageEntry,
  ImageMimeType,
  PdfJobOptions,
  PdfState,
  ProgressMessage,
  StartJobMessage,
  WorkerToMainMessage,
} from './pdf-worker.types';
import { ZH_TW } from './i18n';

export const MAX_IMAGES = 15;
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const COPY = ZH_TW.service;
const DEFAULT_OPTIONS: Required<PdfJobOptions> = {
  pageSize: [595.28, 841.89],
  maxImageDimension: 2048,
  jpegQuality: 0.85,
};

const ACCEPTED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
]);
const REJECTED_MIME_TYPES = new Set<string>(['image/heic', 'image/heif']);

interface NormalizedImage {
  buffer: ArrayBuffer;
  mimeType: ImageMimeType;
}

interface ImageLike {
  width: number;
  height: number;
}

@Injectable({ providedIn: 'root' })
export class PdfBuilderService implements OnDestroy {
  private readonly document = inject(DOCUMENT);
  private worker: Worker | null = null;
  private activeJobId: string | null = null;

  private readonly stateSignal = signal<PdfState>({
    images: [],
    status: 'idle',
    progress: 0,
    progressText: COPY.ready,
    pdfUrl: null,
    error: null,
  });

  readonly state = this.stateSignal.asReadonly();
  readonly selectedCount = computed(() => this.state().images.length);
  readonly canGenerate = computed(
    () => this.selectedCount() > 0 && this.state().status !== 'processing',
  );
  readonly isProcessing = computed(() => this.state().status === 'processing');
  readonly canShare = computed(() => this.state().pdfUrl !== null && 'share' in navigator);

  ngOnDestroy(): void {
    this.reset();
  }

  addFiles(fileList: FileList | File[]): string[] {
    const incoming = Array.from(fileList);
    const current = this.state().images;
    const errors: string[] = [];
    const remainingSlots = Math.max(0, MAX_IMAGES - current.length);

    if (incoming.length > remainingSlots) {
      errors.push(COPY.maxImages(MAX_IMAGES, incoming.length - remainingSlots));
    }

    const accepted: ImageEntry[] = [];
    for (const file of incoming.slice(0, remainingSlots)) {
      const validationError = this.validateFile(file);
      if (validationError) {
        errors.push(validationError);
        continue;
      }

      accepted.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'pending',
      });
    }

    this.revokePdfUrl();
    this.stateSignal.update((state) => ({
      ...state,
      images: [...state.images, ...accepted],
      status: 'idle',
      progress: 0,
      progressText: accepted.length ? COPY.added(accepted.length) : state.progressText,
      pdfUrl: null,
      error: errors.length ? errors.join('\n') : null,
    }));

    return errors;
  }

  removeImage(id: string): void {
    this.stateSignal.update((state) => {
      const target = state.images.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return {
        ...state,
        images: state.images.filter((image) => image.id !== id),
        error: null,
      };
    });
  }

  async buildPdf(): Promise<void> {
    const images = this.state().images;
    if (!images.length || this.state().status === 'processing') {
      return;
    }

    this.cancelActiveWorker();
    this.revokePdfUrl();

    this.stateSignal.update((state) => ({
      ...state,
      status: 'processing',
      progress: 1,
      progressText: COPY.preparing(images.length),
      pdfUrl: null,
      error: null,
      images: state.images.map((image) => ({ ...image, status: 'pending' })),
    }));

    try {
      if (this.canUseWorkerPipeline()) {
        await this.buildPdfInWorker(images);
      } else {
        await this.buildPdfWithMainThreadResize(images);
      }
    } catch {
      this.handleBuildError();
    }
  }

  cancel(): void {
    if (this.activeJobId && this.worker) {
      this.worker.postMessage({ type: 'CANCEL_JOB', jobId: this.activeJobId });
    }
    this.cancelActiveWorker();
    this.stateSignal.update((state) => ({
      ...state,
      status: 'idle',
      progress: 0,
      progressText: COPY.cancelled,
      images: state.images.map((image) => ({ ...image, status: 'pending' })),
    }));
  }

  reset(): void {
    this.cancelActiveWorker();
    const state = this.state();
    for (const image of state.images) {
      URL.revokeObjectURL(image.previewUrl);
    }
    this.revokePdfUrl();
    this.stateSignal.set({
      images: [],
      status: 'idle',
      progress: 0,
      progressText: COPY.ready,
      pdfUrl: null,
      error: null,
    });
  }

  async sharePdf(): Promise<void> {
    const pdfUrl = this.state().pdfUrl;
    if (!pdfUrl || !('share' in navigator)) {
      return;
    }

    const response = await fetch(pdfUrl);
    const blob = await response.blob();
    const file = new File([blob], this.outputFileName(), { type: 'application/pdf' });
    const shareData: ShareData = {
      title: COPY.shareTitle,
      text: COPY.shareText,
      files: [file],
    };

    if ('canShare' in navigator && !navigator.canShare(shareData)) {
      return;
    }

    try {
      await navigator.share(shareData);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      this.stateSignal.update((state) => ({
        ...state,
        error: COPY.shareFailed,
      }));
    }
  }

  outputFileName(): string {
    const date = new Date().toISOString().slice(0, 10);
    return `img2pdf-${date}.pdf`;
  }

  private buildPdfInWorker(images: ImageEntry[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const jobId = crypto.randomUUID();
      this.activeJobId = jobId;
      this.worker = new Worker(new URL('./pdf.worker', import.meta.url), { type: 'module' });

      this.worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
        const message = event.data;
        if (message.jobId !== jobId) {
          return;
        }

        switch (message.type) {
          case 'PROGRESS':
            this.handleProgress(message);
            break;
          case 'COMPLETE':
            this.handleComplete(message);
            this.cancelActiveWorker();
            resolve();
            break;
          case 'ERROR':
            this.cancelActiveWorker();
            reject(new Error(message.message));
            break;
          case 'CANCELLED':
            this.cancelActiveWorker();
            resolve();
            break;
        }
      };

      this.worker.onerror = (event) => {
        this.cancelActiveWorker();
        reject(new Error(event.message || COPY.workerFailed));
      };

      void this.prepareWorkerJob(jobId, images)
        .then(({ message, transferList }) => {
          if (!this.worker || this.activeJobId !== jobId) {
            throw new Error(COPY.cancelledBeforeStart);
          }
          this.worker.postMessage(message, transferList);
        })
        .catch((error: unknown) => {
          this.cancelActiveWorker();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private async prepareWorkerJob(
    jobId: string,
    images: ImageEntry[],
  ): Promise<{ message: StartJobMessage; transferList: Transferable[] }> {
    const buffers: ArrayBuffer[] = [];
    const mimeTypes: ImageMimeType[] = [];

    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      this.markImage(index, 'processing');
      buffers.push(await image.file.arrayBuffer());
      mimeTypes.push(this.toWorkerMimeType(image.file.type));
    }

    return {
      message: {
        type: 'START_JOB',
        jobId,
        buffers,
        mimeTypes,
        options: DEFAULT_OPTIONS,
      },
      transferList: buffers,
    };
  }

  private async buildPdfWithMainThreadResize(images: ImageEntry[]): Promise<void> {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const [pageWidth, pageHeight] = DEFAULT_OPTIONS.pageSize;

    for (let index = 0; index < images.length; index += 1) {
      this.markImage(index, 'processing');
      this.updateProgress(
        index,
        images.length,
        'resize',
        COPY.optimizing(index + 1, images.length),
      );

      const normalized = await this.normalizeImageOnMainThread(images[index].file);
      const page = doc.addPage(DEFAULT_OPTIONS.pageSize);
      const embedded = await doc.embedJpg(normalized.buffer);
      const fit = embedded.scaleToFit(pageWidth, pageHeight);

      page.drawImage(embedded, {
        x: (pageWidth - fit.width) / 2,
        y: (pageHeight - fit.height) / 2,
        width: fit.width,
        height: fit.height,
      });

      this.markImage(index, 'done');
      this.updateProgress(
        index + 1,
        images.length,
        'embed',
        COPY.addedPage(index + 1, images.length),
      );
      await this.yieldToBrowser();
    }

    this.stateSignal.update((state) => ({
      ...state,
      progress: 96,
      progressText: COPY.finalizing,
    }));

    const pdfBytes = await doc.save();
    this.createPdfUrl(pdfBytes.buffer as ArrayBuffer, images.length, 0);
  }

  private async normalizeImageOnMainThread(file: File): Promise<NormalizedImage> {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try {
        return await this.renderImageToJpeg(bitmap);
      } finally {
        bitmap.close();
      }
    }

    const image = await this.loadHtmlImage(file);
    return this.renderImageToJpeg(image);
  }

  private renderImageToJpeg(image: ImageLike & CanvasImageSource): Promise<NormalizedImage> {
    const { width, height } = this.fitDimensions(image.width, image.height);
    const canvas = this.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      return Promise.reject(new Error(COPY.canvasUnavailable));
    }

    context.drawImage(image, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error(COPY.imageEncodeFailed));
            return;
          }
          blob
            .arrayBuffer()
            .then((buffer) => resolve({ buffer, mimeType: 'image/jpeg' }))
            .catch((error: unknown) => reject(error));
        },
        'image/jpeg',
        DEFAULT_OPTIONS.jpegQuality,
      );
    });
  }

  private loadHtmlImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(COPY.imageDecodeFailed(file.name)));
      };
      image.src = url;
    });
  }

  private handleProgress(message: ProgressMessage): void {
    const displayIndex = Math.min(message.current + 1, message.total);
    const text =
      message.phase === 'serialize'
        ? COPY.finalizing
        : COPY.processing(displayIndex, message.total);

    if (message.phase === 'embed') {
      this.markImage(message.current, 'done');
    } else if (message.phase !== 'serialize') {
      this.markImage(message.current, 'processing');
    }

    this.stateSignal.update((state) => ({
      ...state,
      progress: message.progressPct,
      progressText: text,
    }));
  }

  private handleComplete(message: CompleteMessage): void {
    this.createPdfUrl(message.pdfBuffer, message.stats.imageCount, message.stats.durationMs);
  }

  private createPdfUrl(pdfBuffer: ArrayBuffer, imageCount: number, durationMs: number): void {
    this.revokePdfUrl();
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const pdfUrl = URL.createObjectURL(blob);
    this.stateSignal.update((state) => ({
      ...state,
      status: 'complete',
      progress: 100,
      progressText: COPY.readyPdf(imageCount, durationMs),
      pdfUrl,
      error: null,
      images: state.images.map((image) => ({ ...image, status: 'done' })),
    }));
  }

  private handleBuildError(): void {
    this.cancelActiveWorker();
    this.stateSignal.update((state) => ({
      ...state,
      status: 'error',
      progress: 0,
      progressText: COPY.generationFailed,
      error: COPY.generationFailed,
      images: state.images.map((image) => ({
        ...image,
        status: image.status === 'processing' ? 'error' : image.status,
      })),
    }));
  }

  private validateFile(file: File): string | null {
    if (file.size === 0) {
      return COPY.fileEmpty(file.name);
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return COPY.fileTooLarge(file.name, MAX_FILE_SIZE_MB);
    }
    if (REJECTED_MIME_TYPES.has(file.type) || /\.(heic|heif)$/i.test(file.name)) {
      return COPY.rejectedHeic(file.name);
    }
    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      return COPY.unsupportedType(file.name);
    }
    return null;
  }

  private toWorkerMimeType(type: string): ImageMimeType {
    if (type === 'image/png' || type === 'image/webp' || type === 'image/avif') {
      return type;
    }
    return 'image/jpeg';
  }

  private markImage(index: number, status: ImageEntry['status']): void {
    this.stateSignal.update((state) => ({
      ...state,
      images: state.images.map((image, imageIndex) =>
        imageIndex === index ? { ...image, status } : image,
      ),
    }));
  }

  private updateProgress(
    current: number,
    total: number,
    phase: string,
    progressText: string,
  ): void {
    const phaseBase = phase === 'embed' ? 55 : 10;
    this.stateSignal.update((state) => ({
      ...state,
      progress: Math.min(95, Math.round(phaseBase + (current / Math.max(total, 1)) * 40)),
      progressText,
    }));
  }

  private fitDimensions(width: number, height: number): { width: number; height: number } {
    const scale = Math.min(1, DEFAULT_OPTIONS.maxImageDimension / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  private canUseWorkerPipeline(): boolean {
    return (
      typeof Worker !== 'undefined' &&
      typeof OffscreenCanvas !== 'undefined' &&
      typeof createImageBitmap === 'function' &&
      typeof OffscreenCanvas.prototype.convertToBlob === 'function'
    );
  }

  private cancelActiveWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.activeJobId = null;
  }

  private revokePdfUrl(): void {
    const pdfUrl = this.state().pdfUrl;
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
  }

  private yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, 0));
  }
}
