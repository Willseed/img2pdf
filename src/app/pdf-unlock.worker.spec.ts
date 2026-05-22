import { ZH_TW } from './i18n';
import type {
  MainToUnlockWorkerMessage,
  UnlockErrorMessage,
  UnlockWorkerToMainMessage,
} from './pdf-unlock-worker.types';

const COMPLETE_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
let messageHandler: (event: MessageEvent<MainToUnlockWorkerMessage>) => void = () => undefined;

interface PostedWorkerMessage {
  message: UnlockWorkerToMainMessage;
  transfer?: Transferable[];
}

interface MockUnlockDocument {
  document: {
    asPDF: ReturnType<typeof vi.fn>;
    needsPassword: ReturnType<typeof vi.fn>;
    getMetaData: ReturnType<typeof vi.fn>;
    authenticatePassword: ReturnType<typeof vi.fn>;
    countPages: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  pdf: {
    saveToBuffer: ReturnType<typeof vi.fn>;
  };
  output: {
    asUint8Array: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
}

describe('pdf-unlock.worker', () => {
  let postedMessages: PostedWorkerMessage[] = [];
  let postMessageDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.resetModules();
    postedMessages = [];
    messageHandler = () => undefined;
    postMessageDescriptor = Object.getOwnPropertyDescriptor(self, 'postMessage');
    Object.defineProperty(self, 'postMessage', {
      configurable: true,
      value: vi.fn((message: UnlockWorkerToMainMessage, transfer?: Transferable[]) => {
        postedMessages.push({ message, transfer });
      }),
    });
    vi.spyOn(globalThis, 'addEventListener').mockImplementation(
      (type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'message' && typeof listener === 'function') {
          messageHandler = listener as (event: MessageEvent<MainToUnlockWorkerMessage>) => void;
        }
      },
    );
  });

  afterEach(() => {
    vi.doUnmock('mupdf');
    vi.restoreAllMocks();
    if (postMessageDescriptor) {
      Object.defineProperty(self, 'postMessage', postMessageDescriptor);
    } else {
      delete (self as unknown as Record<string, unknown>)['postMessage'];
    }
  });

  it('accepts positive MuPDF authentication results even when encryption metadata is unavailable', async () => {
    const unlockDocument = createMockUnlockDocument({
      authResult: 1,
      encryption: undefined,
      needsPassword: true,
    });
    mockMuPdf(unlockDocument);

    await startUnlockWorker('61430824');

    const completeMessage = postedMessages.find(
      ({ message }) => message.type === 'UNLOCK_COMPLETE',
    )?.message;
    expect(unlockDocument.document.authenticatePassword).toHaveBeenCalledWith('61430824');
    expect(unlockDocument.pdf.saveToBuffer).toHaveBeenCalledWith(
      'decrypt,garbage=deduplicate,compress=yes',
    );
    expect(completeMessage).toMatchObject({
      type: 'UNLOCK_COMPLETE',
      stats: {
        pageCount: 1,
        wasPasswordRequired: true,
      },
    });
    expect(unlockDocument.output.destroy).toHaveBeenCalled();
    expect(unlockDocument.document.destroy).toHaveBeenCalled();
  });

  it('returns a zh-TW wrong-password error for failed authentication', async () => {
    const unlockDocument = createMockUnlockDocument({
      authResult: 0,
      encryption: 'Standard V5 R6 256-bit AES',
      needsPassword: false,
    });
    mockMuPdf(unlockDocument);

    await startUnlockWorker('wrong-password');

    const errorMessage = postedMessages.find(
      ({ message }) => message.type === 'UNLOCK_ERROR',
    )?.message as UnlockErrorMessage | undefined;
    expect(unlockDocument.document.authenticatePassword).toHaveBeenCalledWith('wrong-password');
    expect(unlockDocument.pdf.saveToBuffer).not.toHaveBeenCalled();
    expect(errorMessage).toMatchObject({
      type: 'UNLOCK_ERROR',
      errorCode: 'WRONG_PASSWORD',
      message: ZH_TW.unlockWorker.wrongPassword,
    });
  });
});

async function startUnlockWorker(password: string): Promise<void> {
  await import('./pdf-unlock.worker');
  messageHandler({
    data: {
      type: 'START_UNLOCK',
      jobId: 'job-1',
      fileName: 'renamed-document.png',
      buffer: COMPLETE_PDF.buffer.slice(
        COMPLETE_PDF.byteOffset,
        COMPLETE_PDF.byteOffset + COMPLETE_PDF.byteLength,
      ) as ArrayBuffer,
      password,
    },
  } as MessageEvent<MainToUnlockWorkerMessage>);
  await flushAsync();
}

function mockMuPdf(unlockDocument: MockUnlockDocument): void {
  vi.doMock('mupdf', () => ({
    default: {
      Document: {
        META_ENCRYPTION: 'encryption',
        openDocument: vi.fn(() => unlockDocument.document),
      },
    },
  }));
}

function createMockUnlockDocument({
  authResult,
  encryption,
  needsPassword,
}: {
  authResult: number;
  encryption: string | undefined;
  needsPassword: boolean;
}): MockUnlockDocument {
  const output = {
    asUint8Array: vi.fn(() => COMPLETE_PDF),
    destroy: vi.fn(),
  };
  const pdf = {
    saveToBuffer: vi.fn(() => output),
  };

  return {
    document: {
      asPDF: vi.fn(() => pdf),
      needsPassword: vi.fn(() => needsPassword),
      getMetaData: vi.fn(() => encryption),
      authenticatePassword: vi.fn(() => authResult),
      countPages: vi.fn(() => 1),
      destroy: vi.fn(),
    },
    pdf,
    output,
  };
}

async function flushAsync(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}
