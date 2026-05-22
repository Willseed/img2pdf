import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { BUILD_HASH } from './build-info';
import { ZH_TW } from './i18n';
import { MAX_IMAGES, PdfBuilderService } from './pdf-builder.service';
import { PdfUnlockService } from './pdf-unlock.service';
import type { ImageStatus } from './pdf-worker.types';

type ToolTab = 'images' | 'unlock';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('unlockFileInput') private unlockFileInput?: ElementRef<HTMLInputElement>;

  protected readonly pdfBuilder = inject(PdfBuilderService);
  protected readonly pdfUnlock = inject(PdfUnlockService);
  protected readonly buildHash = BUILD_HASH;
  protected readonly isDragging = signal(false);
  protected readonly isUnlockDragging = signal(false);
  protected readonly activeTool = signal<ToolTab>('images');
  protected readonly unlockPassword = signal('');
  protected readonly unlockPasswordVisible = signal(false);
  protected readonly maxImages = MAX_IMAGES;
  protected readonly text = ZH_TW.app;
  protected readonly heroText = computed(() =>
    this.activeTool() === 'images' ? this.text.hero : this.text.unlockHero,
  );

  protected imageStatusLabel(status: ImageStatus): string {
    return ZH_TW.imageStatus[status];
  }

  protected openFilePicker(): void {
    this.fileInput?.nativeElement.click();
  }

  protected openUnlockFilePicker(): void {
    this.unlockFileInput?.nativeElement.click();
  }

  protected selectTool(tool: ToolTab): void {
    this.activeTool.set(tool);
  }

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.pdfBuilder.addFiles(input.files);
      input.value = '';
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(true);
  }

  protected onDragLeave(): void {
    this.isDragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) {
      this.pdfBuilder.addFiles(files);
    }
  }

  protected onUnlockFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.pdfUnlock.selectFiles(input.files);
      input.value = '';
    }
  }

  protected onUnlockDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isUnlockDragging.set(true);
  }

  protected onUnlockDragLeave(): void {
    this.isUnlockDragging.set(false);
  }

  protected onUnlockDrop(event: DragEvent): void {
    event.preventDefault();
    this.isUnlockDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files) {
      this.pdfUnlock.selectFiles(files);
    }
  }

  protected onUnlockPasswordInput(event: Event): void {
    this.unlockPassword.set((event.target as HTMLInputElement).value);
  }

  protected toggleUnlockPasswordVisibility(): void {
    this.unlockPasswordVisible.update((visible) => !visible);
  }

  protected async generatePdf(): Promise<void> {
    await this.pdfBuilder.buildPdf();
  }

  protected async sharePdf(): Promise<void> {
    await this.pdfBuilder.sharePdf();
  }

  protected async unlockPdf(): Promise<void> {
    await this.pdfUnlock.unlock(this.unlockPassword());
  }

  protected async shareUnlockedPdf(): Promise<void> {
    await this.pdfUnlock.sharePdf();
  }

  protected formatPdfSize(file: File): string {
    return this.text.unlock.details.size((file.size / (1024 * 1024)).toFixed(2));
  }
}
