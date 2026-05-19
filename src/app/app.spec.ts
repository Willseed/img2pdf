import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ZH_TW } from './i18n';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render zh-TW copy from the i18n dictionary', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const fileInput = compiled.querySelector<HTMLInputElement>('#image-input');

    expect(compiled.querySelector('h1')?.textContent).toContain(ZH_TW.app.hero.title);
    expect(compiled.querySelector('#upload-title')?.textContent).toContain(ZH_TW.app.upload.title);
    expect(compiled.querySelector('#preview-title')?.textContent).toContain(
      ZH_TW.app.preview.title,
    );
    expect(compiled.querySelector('#process-title')?.textContent).toContain(
      ZH_TW.app.actions.title,
    );
    expect(fileInput?.getAttribute('aria-label')).toBe(ZH_TW.app.upload.inputLabel);
    expect(compiled.textContent).toContain(ZH_TW.service.ready);
    expect(compiled.textContent).not.toContain('Turn 15 images into one PDF');
    expect(compiled.textContent).not.toContain('Review the page order');
  });
});
