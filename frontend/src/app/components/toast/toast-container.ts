import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack">
      <div
        class="toast-pill"
        [class.toast-pill--leaving]="t.leaving"
        *ngFor="let t of toastService.toasts(); trackBy: trackById"
        (click)="toastService.startDismiss(t.id)">
        {{ t.message }}
      </div>
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      bottom: max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px));
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column-reverse;
      align-items: center;
      gap: 8px;
      pointer-events: none;
    }

    .toast-pill {
      background: #1C1B1F;
      color: #FFFBFE;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.4;
      letter-spacing: 0.01em;
      padding: 11px 20px;
      border-radius: 999px;
      white-space: nowrap;
      max-width: min(360px, calc(100vw - 32px));
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: auto;
      cursor: default;
      user-select: none;
      animation: toastIn 220ms cubic-bezier(0.2, 0, 0, 1) both;
    }

    .toast-pill--leaving {
      animation: toastOut 180ms cubic-bezier(0.4, 0, 1, 1) both;
    }

    @keyframes toastIn {
      from { opacity: 0; transform: translateY(10px) scale(0.94); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes toastOut {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to   { opacity: 0; transform: translateY(6px) scale(0.97); }
    }
  `]
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);

  trackById(_: number, t: { id: number }) {
    return t.id;
  }
}
