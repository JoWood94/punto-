import { Injectable, signal } from '@angular/core';

export interface ToastItem {
  id: number;
  message: string;
  leaving: boolean;
  type?: 'default' | 'info';
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<ToastItem[]>([]);
  private counter = 0;

  show(message: string, duration = 3500, type: ToastItem['type'] = 'default'): void {
    const id = ++this.counter;
    this.toasts.update(list => [...list, { id, message, leaving: false, type }]);
    setTimeout(() => this.startDismiss(id), duration);
  }

  startDismiss(id: number): void {
    // Marca leaving → attiva animazione CSS, poi rimuove dopo 180ms
    this.toasts.update(list => list.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => {
      this.toasts.update(list => list.filter(t => t.id !== id));
    }, 180);
  }
}
