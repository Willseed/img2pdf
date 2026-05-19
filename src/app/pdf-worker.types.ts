export type ImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif';

export type UploadStatus = 'idle' | 'processing' | 'complete' | 'error';

export type ImageStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ImageEntry {
  id: string;
  file: File;
  previewUrl: string;
  status: ImageStatus;
  error?: string;
}

export interface PdfState {
  images: ImageEntry[];
  status: UploadStatus;
  progress: number;
  progressText: string;
  pdfUrl: string | null;
  error: string | null;
}

export interface PdfJobOptions {
  pageSize?: [width: number, height: number];
  maxImageDimension?: number;
  jpegQuality?: number;
}

export interface StartJobMessage {
  type: 'START_JOB';
  jobId: string;
  buffers: ArrayBuffer[];
  mimeTypes: ImageMimeType[];
  options: Required<PdfJobOptions>;
}

export interface CancelJobMessage {
  type: 'CANCEL_JOB';
  jobId: string;
}

export type MainToWorkerMessage = StartJobMessage | CancelJobMessage;

export interface ProgressMessage {
  type: 'PROGRESS';
  jobId: string;
  phase: 'decode' | 'resize' | 'embed' | 'serialize';
  current: number;
  total: number;
  progressPct: number;
}

export interface CompleteMessage {
  type: 'COMPLETE';
  jobId: string;
  pdfBuffer: ArrayBuffer;
  stats: {
    durationMs: number;
    imageCount: number;
    originalSizeBytes: number;
    pdfSizeBytes: number;
  };
}

export interface ErrorMessage {
  type: 'ERROR';
  jobId: string;
  errorCode:
    | 'UNSUPPORTED_FORMAT'
    | 'DECODE_FAILED'
    | 'RESIZE_FAILED'
    | 'EMBED_FAILED'
    | 'PDF_CREATION_FAILED'
    | 'OUT_OF_MEMORY'
    | 'CANCELLED_BY_USER';
  message: string;
  imageIndex?: number;
}

export interface CancelledMessage {
  type: 'CANCELLED';
  jobId: string;
}

export type WorkerToMainMessage =
  | ProgressMessage
  | CompleteMessage
  | ErrorMessage
  | CancelledMessage;
