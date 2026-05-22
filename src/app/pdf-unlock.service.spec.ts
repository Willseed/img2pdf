import { TestBed } from '@angular/core/testing';
import { PdfUnlockService } from './pdf-unlock.service';
import { ZH_TW } from './i18n';
import type {
  MainToUnlockWorkerMessage,
  UnlockWorkerToMainMessage,
} from './pdf-unlock-worker.types';

type WorkerMessageHandler = (worker: MockUnlockWorker, message: MainToUnlockWorkerMessage) => void;

const COMPLETE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

let workerMessageHandler: WorkerMessageHandler = () => undefined;
let urlCounter = 0;
let createObjectUrlDescriptor: PropertyDescriptor | undefined;
let revokeObjectUrlDescriptor: PropertyDescriptor | undefined;

class MockUnlockWorker {
  static instances: MockUnlockWorker[] = [];

  onmessage: ((event: MessageEvent<UnlockWorkerToMainMessage>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly messages: MainToUnlockWorkerMessage[] = [];
  terminated = false;

  constructor() {
    MockUnlockWorker.instances.push(this);
  }

  postMessage(message: MainToUnlockWorkerMessage): void {
    this.messages.push(message);
    workerMessageHandler(this, message);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: UnlockWorkerToMainMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<UnlockWorkerToMainMessage>);
  }
}

describe('PdfUnlockService', () => {
  let service: PdfUnlockService;

  beforeEach(() => {
    workerMessageHandler = () => undefined;
    MockUnlockWorker.instances = [];
    urlCounter = 0;
    createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => {
        urlCounter += 1;
        return `blob:unlock-${urlCounter}`;
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal('Worker', MockUnlockWorker);

    TestBed.configureTestingModule({});
    service = TestBed.inject(PdfUnlockService);
  });

  afterEach(() => {
    service.ngOnDestroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    restoreUrlProperty('createObjectURL', createObjectUrlDescriptor);
    restoreUrlProperty('revokeObjectURL', revokeObjectUrlDescriptor);
    vi.restoreAllMocks();
  });

  it('starts with idle zh-TW state and validates selected PDFs', () => {
    expect(service.state()).toEqual({
      file: null,
      status: 'idle',
      progress: 0,
      progressText: ZH_TW.unlockService.ready,
      unlockedUrl: null,
      error: null,
    });
    expect(service.canUnlock()).toBe(false);

    const firstFile = pdfFile('locked.pdf');
    const secondFile = pdfFile('ignored.pdf');
    const errors = service.selectFiles([firstFile, secondFile]);

    expect(errors).toEqual([ZH_TW.unlockService.singleFile]);
    expect(service.state().file).toBe(firstFile);
    expect(service.state().error).toBe(ZH_TW.unlockService.singleFile);
    expect(service.state().progressText).toBe(ZH_TW.unlockService.selected(firstFile.name));
    expect(service.canUnlock()).toBe(true);
  });

  it('rejects empty unlock files with zh-TW errors', () => {
    expect(service.selectFiles([new File([], 'empty.pdf', { type: 'application/pdf' })])).toEqual([
      ZH_TW.unlockService.fileEmpty('empty.pdf'),
    ]);
    expect(service.state().file).toBeNull();
    expect(service.state().status).toBe('error');
    expect(service.state().error).toBe(ZH_TW.unlockService.fileEmpty('empty.pdf'));
  });

  it('allows MuPDF to validate files whose extension or MIME type is wrong', () => {
    const renamedPdf = new File([COMPLETE_PDF], '截圖 2026-05-22 上午8.39.57.png', {
      type: 'image/png',
    });

    expect(service.selectFiles([renamedPdf])).toEqual([]);
    expect(service.state().file).toBe(renamedPdf);
    expect(service.state().status).toBe('idle');
    expect(service.state().error).toBeNull();
    expect(service.state().progressText).toBe(ZH_TW.unlockService.selected(renamedPdf.name));
  });

  it('tracks progress, creates an unlocked PDF URL, and revokes it on replacement', async () => {
    workerMessageHandler = (worker, message) => {
      if (message.type !== 'START_UNLOCK') {
        return;
      }

      queueMicrotask(() => {
        worker.emit({
          type: 'UNLOCK_PROGRESS',
          jobId: message.jobId,
          phase: 'opening',
          progressPct: 24,
        });
        worker.emit({
          type: 'UNLOCK_COMPLETE',
          jobId: message.jobId,
          pdfBuffer: arrayBufferFor(COMPLETE_PDF),
          stats: {
            durationMs: 0,
            pageCount: 1,
            originalSizeBytes: message.buffer.byteLength,
            pdfSizeBytes: COMPLETE_PDF.byteLength,
            wasPasswordRequired: true,
          },
        });
      });
    };

    const lockedFile = pdfFile('safe:name.pdf');
    service.selectFiles([lockedFile]);

    await service.unlock('correct horse battery staple');

    const worker = MockUnlockWorker.instances[0];
    const startMessage = worker.messages.find((message) => message.type === 'START_UNLOCK');
    expect(startMessage).toMatchObject({
      type: 'START_UNLOCK',
      fileName: lockedFile.name,
      password: 'correct horse battery staple',
    });
    expect(worker.terminated).toBe(true);
    expect(service.state().status).toBe('complete');
    expect(service.state().progress).toBe(100);
    expect(service.state().progressText).toBe(ZH_TW.unlockService.readyPdf(1, 0));
    expect(service.state().unlockedUrl).toBe('blob:unlock-1');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(service.outputFileName()).toBe('safe-name-unlocked.pdf');

    const replacementFile = pdfFile('replacement.pdf');
    service.selectFiles([replacementFile]);

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:unlock-1');
    expect(service.state().file).toBe(replacementFile);
    expect(service.state().unlockedUrl).toBeNull();
  });

  it('keeps wrong-password errors recoverable without reselecting the PDF', async () => {
    workerMessageHandler = (worker, message) => {
      if (message.type !== 'START_UNLOCK') {
        return;
      }

      queueMicrotask(() => {
        if (message.password === 'wrong') {
          worker.emit({
            type: 'UNLOCK_ERROR',
            jobId: message.jobId,
            errorCode: 'WRONG_PASSWORD',
            message: 'Wrong password',
          });
          return;
        }

        worker.emit({
          type: 'UNLOCK_COMPLETE',
          jobId: message.jobId,
          pdfBuffer: arrayBufferFor(COMPLETE_PDF),
          stats: {
            durationMs: 125,
            pageCount: 1,
            originalSizeBytes: message.buffer.byteLength,
            pdfSizeBytes: COMPLETE_PDF.byteLength,
            wasPasswordRequired: true,
          },
        });
      });
    };

    const lockedFile = pdfFile('recoverable.pdf');
    service.selectFiles([lockedFile]);

    await service.unlock('wrong');

    expect(service.state().status).toBe('error');
    expect(service.state().file).toBe(lockedFile);
    expect(service.state().error).toBe(ZH_TW.unlockWorker.wrongPassword);
    expect(service.state().progressText).toBe(ZH_TW.unlockWorker.wrongPassword);
    expect(service.canUnlock()).toBe(true);

    await service.unlock('correct');

    expect(service.state().status).toBe('complete');
    expect(service.state().error).toBeNull();
    expect(service.state().unlockedUrl).toBe('blob:unlock-1');
  });

  it('shows Cloudflare CSP guidance when WebAssembly compilation is blocked', async () => {
    workerMessageHandler = (worker, message) => {
      if (message.type !== 'START_UNLOCK') {
        return;
      }

      queueMicrotask(() => {
        worker.emit({
          type: 'UNLOCK_ERROR',
          jobId: message.jobId,
          errorCode: 'WASM_BLOCKED_BY_CSP',
          message: 'CSP blocked WebAssembly',
        });
      });
    };

    const lockedFile = pdfFile('csp-blocked.pdf');
    service.selectFiles([lockedFile]);

    await service.unlock('secret');

    expect(service.state().status).toBe('error');
    expect(service.state().file).toBe(lockedFile);
    expect(service.state().error).toBe(ZH_TW.unlockWorker.wasmBlockedByCsp);
    expect(service.state().progressText).toBe(ZH_TW.unlockWorker.wasmBlockedByCsp);
    expect(service.canUnlock()).toBe(true);
  });

  it('surfaces worker runtime error details when unlock worker crashes', async () => {
    const lockedFile = pdfFile('worker-error.pdf');
    service.selectFiles([lockedFile]);

    const unlockPromise = service.unlock('secret');
    await Promise.resolve();
    await Promise.resolve();

    const worker = MockUnlockWorker.instances[0];
    worker.onerror?.({ message: 'MuPDF worker crashed' } as ErrorEvent);
    await unlockPromise;

    expect(worker.terminated).toBe(true);
    expect(service.state().status).toBe('error');
    expect(service.state().error).toBe('MuPDF worker crashed');
    expect(service.state().progressText).toBe('MuPDF worker crashed');
  });

  it('cancels active unlock work and returns to idle state', async () => {
    const lockedFile = pdfFile('cancel.pdf');
    service.selectFiles([lockedFile]);

    const unlockPromise = service.unlock('secret');
    await Promise.resolve();
    await Promise.resolve();

    const worker = MockUnlockWorker.instances[0];
    expect(service.isProcessing()).toBe(true);

    service.cancel();
    await unlockPromise;

    expect(worker.messages.at(-1)).toMatchObject({
      type: 'CANCEL_UNLOCK',
      jobId: (worker.messages[0] as { jobId: string }).jobId,
    });
    expect(worker.terminated).toBe(true);
    expect(service.state().status).toBe('idle');
    expect(service.state().progress).toBe(0);
    expect(service.state().progressText).toBe(ZH_TW.unlockService.cancelled);
    expect(service.state().file).toBe(lockedFile);
  });
});

function pdfFile(name: string): File {
  return new File([COMPLETE_PDF], name, { type: 'application/pdf' });
}

function arrayBufferFor(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function restoreUrlProperty(
  key: 'createObjectURL' | 'revokeObjectURL',
  descriptor?: PropertyDescriptor,
): void {
  if (descriptor) {
    Object.defineProperty(URL, key, descriptor);
    return;
  }

  delete (URL as unknown as Record<string, unknown>)[key];
}
