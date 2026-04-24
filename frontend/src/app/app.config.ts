import { ApplicationConfig, provideZoneChangeDetection, isDevMode, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { initializeApp, provideFirebaseApp } from '@angular/fire/app';
import { getAuth, provideAuth } from '@angular/fire/auth';
import { getMessaging, provideMessaging } from '@angular/fire/messaging';
import { environment } from '../environments/environment';
import { provideServiceWorker } from '@angular/service-worker';
import { LOCALE_ID } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';
import { firstValueFrom } from 'rxjs';

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation()),
    provideHttpClient(),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideMessaging(() => getMessaging()),
    provideServiceWorker('combined-sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: LOCALE_ID, useValue: 'it-IT' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
    provideNativeDateAdapter(),
    provideTranslateService({ fallbackLang: 'en' }),
    // Prefix assoluto: HttpClient non lo combina con baseHref, evita 404 su
    // deploy con base-href diverso da '/'.
    provideTranslateHttpLoader({ prefix: '/assets/i18n/', suffix: '.json' }),
    // Blocca il bootstrap finché it.json non è caricato: nessun componente
    // viene montato prima che TranslateService abbia le traduzioni italiane.
    provideAppInitializer(() => {
      const translate = inject(TranslateService);
      translate.setDefaultLang('it');
      return firstValueFrom(translate.use('it')).catch(err => {
        // Safety net: logga l'errore (es. 404 su assets) ma non blocca il boot.
        console.error('[i18n] Failed to load it.json:', err);
        return null;
      });
    }),
  ],
};
