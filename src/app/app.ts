import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { BUILD_HASH } from './build-info';
import { ZH_TW } from './i18n';
import { MAX_IMAGES, PdfBuilderService } from './pdf-builder.service';
import type { ImageStatus } from './pdf-worker.types';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  protected readonly pdfBuilder = inject(PdfBuilderService);
  protected readonly buildHash = BUILD_HASH;
  protected readonly isDragging = signal(false);
  protected readonly maxImages = MAX_IMAGES;
  protected readonly text = ZH_TW.app;

  protected imageStatusLabel(status: ImageStatus): string {
    return ZH_TW.imageStatus[status];
  }

  protected openFilePicker(): void {
    this.fileInput?.nativeElement.click();
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

  protected async generatePdf(): Promise<void> {
    await this.pdfBuilder.buildPdf();
  }

  protected async sharePdf(): Promise<void> {
    await this.pdfBuilder.sharePdf();
  }
}
