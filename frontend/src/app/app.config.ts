import { ApplicationConfig, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter, withHashLocation } from '@angular/router';

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

registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withHashLocation()),
    provideFirebaseApp(() => initializeApp(environment.firebase)),
    provideAuth(() => getAuth()),
    provideMessaging(() => getMessaging()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
    { provide: LOCALE_ID, useValue: 'it-IT' },
    { provide: MAT_DATE_LOCALE, useValue: 'it-IT' },
  ],
};
