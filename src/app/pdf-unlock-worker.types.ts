export type PdfUnlockStatus = 'idle' | 'processing' | 'complete' | 'error';

export type PdfUnlockPhase = 'loading' | 'opening' | 'authenticating' | 'decrypting' | 'saving';

export type PdfUnlockErrorCode =
  | 'MISSING_PASSWORD'
  | 'WRONG_PASSWORD'
  | 'UNENCRYPTED_PDF'
  | 'UNSUPPORTED_FORMAT'
  | 'CORRUPT_PDF'
  | 'UNLOCK_FAILED'
  | 'CANCELLED_BY_USER';

export interface PdfUnlockState {
  file: File | null;
  status: PdfUnlockStatus;
  progress: number;
  progressText: string;
  unlockedUrl: string | null;
  error: string | null;
}

export interface StartUnlockMessage {
  type: 'START_UNLOCK';
  jobId: string;
  fileName: string;
  buffer: ArrayBuffer;
  password: string;
}

export interface CancelUnlockMessage {
  type: 'CANCEL_UNLOCK';
  jobId: string;
}

export type MainToUnlockWorkerMessage = StartUnlockMessage | CancelUnlockMessage;

export interface UnlockProgressMessage {
  type: 'UNLOCK_PROGRESS';
  jobId: string;
  phase: PdfUnlockPhase;
  progressPct: number;
}

export interface UnlockCompleteMessage {
  type: 'UNLOCK_COMPLETE';
  jobId: string;
  pdfBuffer: ArrayBuffer;
  stats: {
    durationMs: number;
    pageCount: number;
    originalSizeBytes: number;
    pdfSizeBytes: number;
    wasPasswordRequired: boolean;
  };
}

export interface UnlockErrorMessage {
  type: 'UNLOCK_ERROR';
  jobId: string;
  errorCode: PdfUnlockErrorCode;
  message: string;
}

export interface UnlockCancelledMessage {
  type: 'UNLOCK_CANCELLED';
  jobId: string;
}

export type UnlockWorkerToMainMessage =
  | UnlockProgressMessage
  | UnlockCompleteMessage
  | UnlockErrorMessage
  | UnlockCancelledMessage;
