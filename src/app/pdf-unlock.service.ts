import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import { ZH_TW } from './i18n';
import {
  PdfUnlockState,
  StartUnlockMessage,
  UnlockCompleteMessage,
  UnlockProgressMessage,
  UnlockWorkerToMainMessage,
} from './pdf-unlock-worker.types';

const COPY = ZH_TW.unlockService;
const MAX_PDF_FILE_SIZE_MB = 100;
const MAX_PDF_FILE_SIZE_BYTES = MAX_PDF_FILE_SIZE_MB * 1024 * 1024;
const ACCEPTED_PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf']);

@Injectable({ providedIn: 'root' })
export class PdfUnlockService implements OnDestroy {
  private worker: Worker | null = null;
  private activeJobId: string | null = null;
  private activeResolve: (() => void) | null = null;

  private readonly stateSignal = signal<PdfUnlockState>({
    file: null,
    status: 'idle',
    progress: 0,
    progressText: COPY.ready,
    unlockedUrl: null,
    error: null,
  });

  readonly state = this.stateSignal.asReadonly();
  readonly hasFile = computed(() => this.state().file !== null);
  readonly isProcessing = computed(() => this.state().status === 'processing');
  readonly canUnlock = computed(() => this.hasFile() && !this.isProcessing());
  readonly canShare = computed(() => this.state().unlockedUrl !== null && 'share' in navigator);

  ngOnDestroy(): void {
    this.reset();
  }

  selectFiles(fileList: FileList | File[]): string[] {
    const files = Array.from(fileList);
    if (!files.length) {
      return [];
    }

    const errors: string[] = [];
    if (files.length > 1) {
      errors.push(COPY.singleFile);
    }

    const file = files[0];
    const validationError = this.validateFile(file);
    if (validationError) {
      errors.push(validationError);
      this.cancelAndResolveActiveWorker();
      this.revokeUnlockedUrl();
      this.stateSignal.set({
        file: null,
        status: 'error',
        progress: 0,
        progressText: COPY.ready,
        unlockedUrl: null,
        error: errors.join('\n'),
      });
      return errors;
    }

    this.cancelAndResolveActiveWorker();
    this.revokeUnlockedUrl();
    this.stateSignal.set({
      file,
      status: 'idle',
      progress: 0,
      progressText: COPY.selected(file.name),
      unlockedUrl: null,
      error: errors.length ? errors.join('\n') : null,
    });
    return errors;
  }

  async unlock(password: string): Promise<void> {
    const file = this.state().file;
    if (!file || this.state().status === 'processing') {
      return;
    }

    this.cancelActiveWorker();
    this.revokeUnlockedUrl();
    this.stateSignal.update((state) => ({
      ...state,
      status: 'processing',
      progress: 1,
      progressText: COPY.loading(file.name),
      unlockedUrl: null,
      error: null,
    }));

    try {
      await this.unlockInWorker(file, password);
    } catch (error) {
      this.handleUnlockError(error);
    }
  }

  cancel(): void {
    const resolve = this.activeResolve;
    if (this.activeJobId && this.worker) {
      this.worker.postMessage({ type: 'CANCEL_UNLOCK', jobId: this.activeJobId });
    }
    this.cancelActiveWorker();
    resolve?.();
    this.stateSignal.update((state) => ({
      ...state,
      status: 'idle',
      progress: 0,
      progressText: COPY.cancelled,
    }));
  }

  reset(): void {
    this.cancelAndResolveActiveWorker();
    this.revokeUnlockedUrl();
    this.stateSignal.set({
      file: null,
      status: 'idle',
      progress: 0,
      progressText: COPY.ready,
      unlockedUrl: null,
      error: null,
    });
  }

  async sharePdf(): Promise<void> {
    const unlockedUrl = this.state().unlockedUrl;
    if (!unlockedUrl || !('share' in navigator)) {
      return;
    }

    const response = await fetch(unlockedUrl);
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
    const fileName = this.state().file?.name ?? 'pdf';
    const baseName = fileName.replace(/\.pdf$/i, '').trim() || 'pdf';
    const safeName = baseName.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'pdf';
    return `${safeName}-unlocked.pdf`;
  }

  private unlockInWorker(file: File, password: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const jobId = crypto.randomUUID();
      this.activeJobId = jobId;
      this.activeResolve = resolve;
      this.worker = new Worker(new URL('./pdf-unlock.worker', import.meta.url), { type: 'module' });

      this.worker.onmessage = (event: MessageEvent<UnlockWorkerToMainMessage>) => {
        const message = event.data;
        if (message.jobId !== jobId) {
          return;
        }

        switch (message.type) {
          case 'UNLOCK_PROGRESS':
            this.handleProgress(message);
            break;
          case 'UNLOCK_COMPLETE':
            this.handleComplete(message);
            this.cancelActiveWorker();
            resolve();
            break;
          case 'UNLOCK_ERROR':
            this.cancelActiveWorker();
            reject(new Error(message.message));
            break;
          case 'UNLOCK_CANCELLED':
            this.cancelActiveWorker();
            resolve();
            break;
        }
      };

      this.worker.onerror = (event) => {
        this.cancelActiveWorker();
        reject(new Error(event.message || COPY.workerFailed));
      };

      void file
        .arrayBuffer()
        .then((buffer) => {
          if (!this.worker || this.activeJobId !== jobId) {
            throw new Error(COPY.cancelledBeforeStart);
          }

          const message: StartUnlockMessage = {
            type: 'START_UNLOCK',
            jobId,
            fileName: file.name,
            buffer,
            password,
          };
          this.worker.postMessage(message, [buffer]);
        })
        .catch((error: unknown) => {
          this.cancelActiveWorker();
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  private handleProgress(message: UnlockProgressMessage): void {
    this.stateSignal.update((state) => ({
      ...state,
      progress: message.progressPct,
      progressText: COPY.progress[message.phase],
    }));
  }

  private handleComplete(message: UnlockCompleteMessage): void {
    this.revokeUnlockedUrl();
    const blob = new Blob([message.pdfBuffer], { type: 'application/pdf' });
    const unlockedUrl = URL.createObjectURL(blob);
    this.stateSignal.update((state) => ({
      ...state,
      status: 'complete',
      progress: 100,
      progressText: COPY.readyPdf(message.stats.pageCount, message.stats.durationMs),
      unlockedUrl,
      error: null,
    }));
  }

  private handleUnlockError(error: unknown): void {
    this.cancelActiveWorker();
    const message = error instanceof Error && error.message ? error.message : COPY.unlockFailed;
    this.stateSignal.update((state) => ({
      ...state,
      status: 'error',
      progress: 0,
      progressText: message,
      error: message,
    }));
  }

  private validateFile(file: File): string | null {
    if (file.size === 0) {
      return COPY.fileEmpty(file.name);
    }
    if (file.size > MAX_PDF_FILE_SIZE_BYTES) {
      return COPY.fileTooLarge(file.name, MAX_PDF_FILE_SIZE_MB);
    }

    const hasPdfName = /\.pdf$/i.test(file.name);
    const hasPdfMime = ACCEPTED_PDF_MIME_TYPES.has(file.type);
    if (!hasPdfName && !hasPdfMime) {
      return COPY.unsupportedType(file.name);
    }

    return null;
  }

  private cancelActiveWorker(): void {
    this.worker?.terminate();
    this.worker = null;
    this.activeJobId = null;
    this.activeResolve = null;
  }

  private cancelAndResolveActiveWorker(): void {
    const resolve = this.activeResolve;
    this.cancelActiveWorker();
    resolve?.();
  }

  private revokeUnlockedUrl(): void {
    const unlockedUrl = this.state().unlockedUrl;
    if (unlockedUrl) {
      URL.revokeObjectURL(unlockedUrl);
    }
  }
}
