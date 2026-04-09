import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { DateAdapter } from '@angular/material/core';
import { NoteService } from './note';

@Injectable({ providedIn: 'root' })
export class TranslationService {
  readonly SUPPORTED_LANGS = ['it', 'en'];
  readonly DEFAULT_LANG = 'it';

  private translateService = inject(TranslateService);
  private dateAdapter = inject(DateAdapter);
  private noteService = inject(NoteService);

  private _currentLang = this.DEFAULT_LANG;

  get currentLang(): string { return this._currentLang; }

  /** Full locale string: 'it-IT' or 'en-US' */
  get locale(): string { return this._currentLang === 'it' ? 'it-IT' : 'en-US'; }

  /** Short locale for Angular date pipe: 'it' or 'en-US' */
  get pipeDateLocale(): string { return this._currentLang === 'it' ? 'it' : 'en-US'; }

  async init(): Promise<void> {
    // Default and fallback setup
    this.translateService.setDefaultLang(this.DEFAULT_LANG);

    let lang: string | null = null;

    // 1. Try Firestore preference
    try {
      lang = await this.noteService.getUserPreference<string>('language', '')  || null;
    } catch {
      // offline or not logged in — proceed with fallback
    }

    // 2. Fallback to navigator.language
    if (!lang) {
      const deviceLang = navigator.language?.split('-')[0];
      lang = this.SUPPORTED_LANGS.includes(deviceLang) ? deviceLang : this.DEFAULT_LANG;
    }

    await this.applyLanguage(lang);
  }

  async setLanguage(lang: string, persist = true): Promise<void> {
    await this.applyLanguage(lang);
    if (persist) {
      try {
        await this.noteService.setUserPreference('language', lang);
      } catch {
        // ignore — pref will be saved next time
      }
    }
  }

  private async applyLanguage(lang: string): Promise<void> {
    const validLang = this.SUPPORTED_LANGS.includes(lang) ? lang : this.DEFAULT_LANG;
    this._currentLang = validLang;
    await this.translateService.use(validLang).toPromise();
    this.dateAdapter.setLocale(this.locale);
  }

  instant(key: string, params?: object): string {
    return this.translateService.instant(key, params);
  }
}
