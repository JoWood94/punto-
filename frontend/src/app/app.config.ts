import { ApplicationConfig, provideZoneChangeDetection, isDevMode, importProvidersFrom } from '@angular/core';
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
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { provideTranslateService } from '@ngx-translate/core';
import { provideTranslateHttpLoader } from '@ngx-translate/http-loader';

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
    provideTranslateService({ defaultLanguage: 'it' }),
    provideTranslateHttpLoader({ prefix: 'assets/i18n/', suffix: '.json' }),
  ],
};
