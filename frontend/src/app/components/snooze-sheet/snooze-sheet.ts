import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener,
  Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChildren, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

export interface SnoozePreset {
  labelKey: string;
  getTime: () => number;
}

export interface ReminderSubscriptionState {
  muted: boolean;
  snoozedUntil: number | null;
}

/**
 * Menu floating per gestire la sottoscrizione reminder per-user.
 * Stack di pill coerente con create-fab (editorial minimalism).
 *
 * Accessibility:
 *  - role="menu" + aria-label
 *  - ESC → dismiss
 *  - Focus automatico sulla prima pill interattiva all'apertura
 */
@Component({
  selector: 'app-snooze-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './snooze-sheet.html',
  styleUrls: ['./snooze-sheet.scss'],
})
export class SnoozeSheetComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() visible = false;
  @Input() currentState: ReminderSubscriptionState | null = null;

  @Output() presetSelected = new EventEmitter<number>();
  @Output() muteSelected = new EventEmitter<void>();
  @Output() reactivate = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

  @ViewChildren('pillBtn') pillButtons!: QueryList<ElementRef<HTMLButtonElement>>;

  translationService = inject(TranslationService);

  // Rendering state: il DOM resta montato anche durante l'animazione di
  // chiusura. visible=false → leaving=true per 180ms → rendering=false.
  // Così .snooze-pill.leaving applica l'animazione inversa senza che il
  // template venga distrutto prima del tempo.
  rendering = false;
  leaving = false;
  private leaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly LEAVE_DURATION = 180;

  readonly presets: SnoozePreset[] = [
    { labelKey: 'EDITOR.SNOOZE_15MIN', getTime: () => Date.now() + 15 * 60 * 1000 },
    { labelKey: 'EDITOR.SNOOZE_1H',    getTime: () => Date.now() + 60 * 60 * 1000 },
    { labelKey: 'EDITOR.SNOOZE_8H',    getTime: () => Date.now() + 8 * 60 * 60 * 1000 },
    {
      labelKey: 'EDITOR.SNOOZE_TOMORROW',
      getTime: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        return d.getTime();
      },
    },
  ];

  get isMuted(): boolean { return !!this.currentState?.muted; }
  get isSnoozedActive(): boolean {
    const until = this.currentState?.snoozedUntil ?? 0;
    return until > Date.now();
  }
  get canReactivate(): boolean { return this.isMuted || this.isSnoozedActive; }

  /**
   * Click-away in CAPTURE phase: al click fuori dallo stack/bell, dismiss
   * il menu. NON consuma l'evento: il click deve proseguire fino al target.
   */
  private readonly absorbOutsideClick = (ev: Event) => {
    if (!this.visible) return;
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    // Chiude al click su QUALSIASI cosa tranne una pill del menu o la
    // campanella trigger: anche gap vuoti dentro lo stack chiudono.
    if (target.closest('.snooze-pill') ||
        target.closest('.reminder-mini-fab')) {
      return;
    }
    if (ev.type === 'click') this.dismiss();
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']) {
      if (changes['visible'].currentValue) {
        this.openEnter();
      } else {
        this.closeExit();
      }
    }
  }

  ngAfterViewInit(): void {
    if (this.visible) this.openEnter();
  }

  ngOnDestroy(): void {
    this.detachClickAway();
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
  }

  /** Entry: abort eventuale animazione di uscita in corso, monta il template,
   *  attacca listener e focus. */
  private openEnter(): void {
    if (this.leaveTimer) { clearTimeout(this.leaveTimer); this.leaveTimer = null; }
    this.leaving = false;
    this.rendering = true;
    queueMicrotask(() => this.focusFirstInteractivePill());
    queueMicrotask(() => this.attachClickAway());
  }

  /** Exit: setta leaving=true per triggerare l'animazione CSS speculare,
   *  poi rimuove il template dopo LEAVE_DURATION. */
  private closeExit(): void {
    this.detachClickAway();
    if (!this.rendering) return;
    this.leaving = true;
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = setTimeout(() => {
      this.rendering = false;
      this.leaving = false;
      this.leaveTimer = null;
    }, this.LEAVE_DURATION);
  }

  private clickAwayAttached = false;
  private attachClickAway(): void {
    if (this.clickAwayAttached) return;
    document.addEventListener('mousedown', this.absorbOutsideClick, { capture: true });
    document.addEventListener('click', this.absorbOutsideClick, { capture: true });
    document.addEventListener('touchstart', this.absorbOutsideClick, { capture: true, passive: false });
    this.clickAwayAttached = true;
  }
  private detachClickAway(): void {
    if (!this.clickAwayAttached) return;
    document.removeEventListener('mousedown', this.absorbOutsideClick, { capture: true } as any);
    document.removeEventListener('click', this.absorbOutsideClick, { capture: true } as any);
    document.removeEventListener('touchstart', this.absorbOutsideClick, { capture: true } as any);
    this.clickAwayAttached = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.visible) return;
    this.dismiss();
  }

  private focusFirstInteractivePill(): void {
    const first = this.pillButtons?.first?.nativeElement;
    first?.focus();
  }

  select(preset: SnoozePreset): void {
    this.presetSelected.emit(preset.getTime());
  }

  mute(): void {
    this.muteSelected.emit();
  }

  reactivateNow(): void {
    this.reactivate.emit();
  }

  dismiss(): void {
    this.dismissed.emit();
  }
}
