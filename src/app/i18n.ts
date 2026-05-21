import type { ImageStatus } from './pdf-worker.types';
import type { PdfUnlockPhase } from './pdf-unlock-worker.types';

const imageStatus = {
  pending: '等待中',
  processing: '處理中',
  done: '已完成',
  error: '發生錯誤',
} satisfies Record<ImageStatus, string>;

const unlockProgress = {
  loading: '正在載入 MuPDF 解鎖引擎。',
  opening: '正在讀取 PDF。',
  authenticating: '正在驗證密碼。',
  decrypting: '正在移除 PDF 加密。',
  saving: '正在產生未加密 PDF。',
} satisfies Record<PdfUnlockPhase, string>;

export const ZH_TW = {
  app: {
    nav: {
      label: '主要導覽',
      homeAria: 'img2pdf 首頁',
      build: (hash: string) => `版本 ${hash}`,
    },
    hero: {
      eyebrow: '私密瀏覽器轉換',
      title: '在同一個畫面把 15 張圖片整理成 PDF。',
      lead: '選圖、排序、轉檔與下載都在本機完成，不會上傳檔案。',
    },
    unlockHero: {
      eyebrow: '本機 PDF 解鎖',
      title: '用 MuPDF 在瀏覽器移除 PDF 密碼。',
      lead: '選擇受保護的 PDF、輸入密碼，直接輸出未加密檔案，不會上傳文件。',
    },
    tabs: {
      label: '選擇 PDF 工具',
      image: '圖片轉 PDF',
      imageDescription: '整理圖片並建立新 PDF',
      unlock: '移除 PDF 密碼',
      unlockDescription: '輸入密碼並下載未加密 PDF',
    },
    upload: {
      step: '選取',
      title: '加入圖片',
      description: '支援 JPEG、PNG、WebP、AVIF；HEIC/HEIF 會顯示轉檔提醒。',
      inputLabel: '選取圖片檔案',
      dropTitle: '拖放圖片到這裡',
      dropCopy: '或點選從裝置瀏覽',
      counter: (selected: number, max: number) => `已選 ${selected}/${max} 張`,
    },
    preview: {
      step: '排序',
      title: '檢查頁面順序',
      description: '每張縮圖會成為一頁；轉檔前可移除不需要的圖片。',
      listLabel: '已選圖片預覽',
      page: (page: number) => `第 ${page} 頁`,
      empty: '尚未選取圖片。',
      remove: '移除',
      removeLabel: (name: string) => `移除 ${name}`,
      imageAlt: (name: string, page: number) => `${name}，第 ${page} 頁預覽`,
    },
    actions: {
      step: '輸出',
      title: '建立 PDF',
      description: '圖片會先在瀏覽器縮放，再依預覽順序嵌入 PDF。',
      progressLabel: '轉換進度',
      generate: '建立 PDF',
      cancel: '取消',
      ready: 'PDF 已完成。',
      download: '下載',
      share: '分享',
    },
    unlock: {
      upload: {
        step: '選取',
        title: '加入受保護 PDF',
        description: '支援標準 PDF；檔案只會在瀏覽器與背景 Worker 中處理。',
        inputLabel: '選取 PDF 檔案',
        dropTitle: '拖放 PDF 到這裡',
        dropCopy: '或點選從裝置瀏覽',
      },
      details: {
        step: '檢查',
        title: '確認文件',
        description: '密碼只用於這次本機解鎖，不會儲存或送出。',
        empty: '尚未選取 PDF。',
        fileLabel: '已選 PDF',
        size: (megabytes: string) => `${megabytes} MB`,
        ready: '準備好移除密碼。',
      },
      actions: {
        step: '解鎖',
        title: '移除密碼',
        description: 'MuPDF 會驗證密碼並重新儲存未加密 PDF，不會把頁面轉成圖片。',
        passwordLabel: 'PDF 密碼',
        passwordPlaceholder: '輸入開啟 PDF 的密碼',
        progressLabel: '解鎖進度',
        unlock: '移除密碼',
        cancel: '取消',
        ready: '未加密 PDF 已完成。',
        download: '下載',
        share: '分享',
      },
    },
  },
  imageStatus,
  service: {
    ready: '就緒',
    maxImages: (max: number, skipped: number) =>
      `最多只能選擇 ${max} 張圖片，已略過 ${skipped} 張。`,
    added: (count: number) => `已加入 ${count} 張圖片。`,
    preparing: (count: number) => `正在準備 ${count} 張圖片。`,
    cancelled: '已取消建立 PDF。',
    optimizing: (current: number, total: number) => `正在最佳化第 ${current}/${total} 張圖片。`,
    addedPage: (current: number, total: number) => `已加入第 ${current}/${total} 張圖片。`,
    finalizing: '正在完成 PDF。',
    processing: (current: number, total: number) => `正在處理第 ${current}/${total} 張圖片。`,
    readyPdf: (pages: number, durationMs: number) =>
      durationMs > 0
        ? `PDF 已完成：${pages} 頁，耗時 ${(durationMs / 1000).toFixed(1)} 秒。`
        : `PDF 已完成：${pages} 頁。`,
    generationFailed: 'PDF 建立失敗，請確認圖片可在瀏覽器中開啟後再試。',
    fileEmpty: (name: string) => `${name} 是空檔案。`,
    fileTooLarge: (name: string, maxMb: number) => `${name} 超過 ${maxMb} MB 限制。`,
    rejectedHeic: (name: string) => `${name} 是 HEIC/HEIF 格式，請先轉換為 JPEG 或 PNG。`,
    unsupportedType: (name: string) =>
      `${name} 不是支援的圖片格式，請使用 JPEG、PNG、WebP 或 AVIF。`,
    shareTitle: 'img2pdf PDF',
    shareText: '已在你的瀏覽器本機建立 PDF。',
    shareFailed: '分享 PDF 失敗，請改用下載。',
    workerFailed: 'PDF 背景處理失敗。',
    cancelledBeforeStart: 'PDF 建立作業在開始前已取消。',
    canvasUnavailable: '無法建立圖片處理畫布。',
    imageEncodeFailed: '無法編碼圖片。',
    imageDecodeFailed: (name: string) => `無法讀取 ${name}。`,
  },
  worker: {
    canvasUnavailable: '無法建立背景圖片畫布。',
    pdfCreationFailed: 'PDF 建立失敗，請確認圖片格式後再試。',
  },
  unlockService: {
    ready: '就緒',
    singleFile: '一次只能處理一個 PDF，已使用第一個檔案。',
    selected: (name: string) => `已選取 ${name}。`,
    loading: (name: string) => `正在準備解鎖 ${name}。`,
    cancelled: '已取消 PDF 解鎖。',
    cancelledBeforeStart: 'PDF 解鎖作業在開始前已取消。',
    readyPdf: (pages: number, durationMs: number) =>
      durationMs > 0
        ? `未加密 PDF 已完成：${pages} 頁，耗時 ${(durationMs / 1000).toFixed(1)} 秒。`
        : `未加密 PDF 已完成：${pages} 頁。`,
    unlockFailed: 'PDF 解鎖失敗，請確認檔案與密碼後再試。',
    workerFailed: 'PDF 解鎖背景處理失敗。',
    fileEmpty: (name: string) => `${name} 是空檔案。`,
    fileTooLarge: (name: string, maxMb: number) => `${name} 超過 ${maxMb} MB 限制。`,
    unsupportedType: (name: string) => `${name} 不是 PDF 檔案，請選擇 .pdf。`,
    shareTitle: '未加密 PDF',
    shareText: '已在你的瀏覽器本機移除 PDF 密碼。',
    shareFailed: '分享 PDF 失敗，請改用下載。',
    progress: unlockProgress,
  },
  unlockWorker: {
    missingPassword: '請輸入 PDF 密碼。',
    wrongPassword: '密碼不正確，請重新輸入。',
    unencryptedPdf: '這份 PDF 沒有加密或密碼保護。',
    unsupportedFormat: 'MuPDF 無法將此檔案辨識為 PDF。',
    corruptPdf: 'PDF 無法讀取，可能已損毀或格式不受支援。',
    cancelled: '已取消 PDF 解鎖。',
  },
} as const;
