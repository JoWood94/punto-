import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotifyService {
  private authService = inject(AuthService);

  // Notifica real-time: chiamata fire-and-forget al val.town proxy.
  // Non blocca l'UI; in caso di fallimento il cron GHA pulisce i flag entro 5min.
  async completionRealtime(noteId: string): Promise<void> {
    const url = environment.notifyUrl;
    if (!url) return;
    try {
      const token = await this.authService.getIdToken();
      if (!token) return;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noteId }),
        keepalive: true,
      });
    } catch {
      // Ignorato: cron fallback coprirà la notifica
    }
  }
}
