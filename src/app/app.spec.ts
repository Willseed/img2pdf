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

  it('should switch to the zh-TW PDF unlock tab', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const imageTab = compiled.querySelector<HTMLButtonElement>('#image-tool-tab');
    const unlockTab = compiled.querySelector<HTMLButtonElement>('#unlock-tool-tab');

    expect(imageTab?.getAttribute('aria-selected')).toBe('true');
    expect(unlockTab?.getAttribute('aria-selected')).toBe('false');

    compiled.querySelector<HTMLButtonElement>('#unlock-tool-tab')?.click();
    fixture.detectChanges();

    const fileInput = compiled.querySelector<HTMLInputElement>('#unlock-input');

    expect(imageTab?.getAttribute('aria-selected')).toBe('false');
    expect(unlockTab?.getAttribute('aria-selected')).toBe('true');
    expect(compiled.querySelector('#image-tool-panel')).toBeNull();
    expect(compiled.querySelector('#unlock-tool-panel')).not.toBeNull();
    expect(compiled.querySelector('h1')?.textContent).toContain(ZH_TW.app.unlockHero.title);
    expect(compiled.querySelector('#unlock-upload-title')?.textContent).toContain(
      ZH_TW.app.unlock.upload.title,
    );
    expect(compiled.querySelector('#unlock-details-title')?.textContent).toContain(
      ZH_TW.app.unlock.details.title,
    );
    expect(compiled.querySelector('#unlock-process-title')?.textContent).toContain(
      ZH_TW.app.unlock.actions.title,
    );
    expect(fileInput?.getAttribute('aria-label')).toBe(ZH_TW.app.unlock.upload.inputLabel);
    expect(compiled.textContent).toContain(ZH_TW.unlockService.ready);
    expect(compiled.textContent).not.toContain('Remove PDF password');
  });

  it('should render selected unlock file details and password controls from i18n', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#unlock-tool-tab')?.click();
    fixture.detectChanges();

    const file = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'locked-test.pdf', {
      type: 'application/pdf',
    });
    const fileInput = compiled.querySelector<HTMLInputElement>('#unlock-input');
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [file],
    });

    fileInput?.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    const passwordInput = compiled.querySelector<HTMLInputElement>('input[type="password"]');
    const unlockButton = Array.from(compiled.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === ZH_TW.app.unlock.actions.unlock,
    );

    expect(passwordInput).not.toBeNull();
    expect(unlockButton).not.toBeUndefined();
    if (!passwordInput || !unlockButton) {
      throw new Error('Unlock password controls were not rendered.');
    }

    expect(compiled.querySelector('.file-card h3')?.textContent).toContain(file.name);
    expect(compiled.textContent).toContain(ZH_TW.app.unlock.details.ready);
    expect(compiled.textContent).toContain(ZH_TW.unlockService.selected(file.name));
    expect(passwordInput.placeholder).toBe(ZH_TW.app.unlock.actions.passwordPlaceholder);
    expect(unlockButton.disabled).toBe(false);

    passwordInput.value = 'secret-pass';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(passwordInput.value).toBe('secret-pass');
  });

  it('should toggle the unlock password visibility with accessible zh-TW controls', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    compiled.querySelector<HTMLButtonElement>('#unlock-tool-tab')?.click();
    fixture.detectChanges();

    const passwordInput = compiled.querySelector<HTMLInputElement>('#unlock-password');
    const toggleButton = compiled.querySelector<HTMLButtonElement>('.password-toggle');

    expect(passwordInput).not.toBeNull();
    expect(toggleButton).not.toBeNull();
    if (!passwordInput || !toggleButton) {
      throw new Error('Unlock password visibility controls were not rendered.');
    }

    expect(passwordInput.type).toBe('password');
    expect(toggleButton.textContent?.trim()).toBe(ZH_TW.app.unlock.actions.showPassword);
    expect(toggleButton.getAttribute('aria-label')).toBe(
      ZH_TW.app.unlock.actions.showPasswordLabel,
    );
    expect(toggleButton.getAttribute('aria-pressed')).toBe('false');

    passwordInput.value = 'secret-pass';
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    toggleButton.click();
    fixture.detectChanges();

    expect(passwordInput.type).toBe('text');
    expect(passwordInput.value).toBe('secret-pass');
    expect(toggleButton.textContent?.trim()).toBe(ZH_TW.app.unlock.actions.hidePassword);
    expect(toggleButton.getAttribute('aria-label')).toBe(
      ZH_TW.app.unlock.actions.hidePasswordLabel,
    );
    expect(toggleButton.getAttribute('aria-pressed')).toBe('true');

    toggleButton.click();
    fixture.detectChanges();

    expect(passwordInput.type).toBe('password');
    expect(passwordInput.value).toBe('secret-pass');
    expect(toggleButton.textContent?.trim()).toBe(ZH_TW.app.unlock.actions.showPassword);
    expect(toggleButton.getAttribute('aria-pressed')).toBe('false');
  });
});
