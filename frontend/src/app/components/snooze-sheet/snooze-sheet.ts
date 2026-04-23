import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener,
  Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChildren, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';
import { DatetimePickerComponent } from '../datetime-picker/datetime-picker.component';

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
 *  - Confirm-on-second-tap su "Silenzia sempre" (azione distruttiva)
 */
@Component({
  selector: 'app-snooze-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, DatetimePickerComponent],
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

  showCustom = false;
  customDate: Date | null = null;

  get isMuted(): boolean { return !!this.currentState?.muted; }
  get isSnoozedActive(): boolean {
    const until = this.currentState?.snoozedUntil ?? 0;
    return until > Date.now();
  }
  get canReactivate(): boolean { return this.isMuted || this.isSnoozedActive; }

  get tomorrowMinDate(): Date { return new Date(); }

  /**
   * Click-away in CAPTURE phase: al click fuori dallo stack/bell, dismiss
   * il menu. NON consuma l'evento: il click deve proseguire fino al target
   * (es. bottone Elimina della dashboard, mat-dialog overlay). Altrimenti
   * consumare il click blocca qualunque interazione mentre il menu è open.
   */
  private readonly absorbOutsideClick = (ev: Event) => {
    if (!this.visible) return;
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.snooze-stack') ||
        target.closest('.snooze-custom-overlay') ||
        target.closest('.reminder-mini-fab')) {
      return;
    }
    if (ev.type === 'click') this.dismiss();
  };

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !changes['visible'].currentValue) {
      this.resetCustom();
      this.detachClickAway();
    } else if (changes['visible'] && changes['visible'].currentValue) {
      // Auto-focus prima pill all'apertura (deferred fino al render)
      queueMicrotask(() => this.focusFirstInteractivePill());
      // Il listener viene attaccato nel microtask successivo per evitare che
      // catturi lo stesso click che ha aperto il menu (sulla campanella).
      queueMicrotask(() => this.attachClickAway());
    }
  }

  ngAfterViewInit(): void {
    if (this.visible) {
      queueMicrotask(() => this.focusFirstInteractivePill());
      queueMicrotask(() => this.attachClickAway());
    }
  }

  ngOnDestroy(): void {
    this.detachClickAway();
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
    this.resetCustom();
  }

  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (!this.showCustom) this.customDate = null;
  }

  onCustomDateChange(d: Date | null): void {
    this.customDate = d;
  }

  confirmCustom(): void {
    if (!this.customDate) return;
    const t = this.customDate.getTime();
    if (t <= Date.now()) return;
    this.presetSelected.emit(t);
    this.resetCustom();
  }

  /** Silenzia sempre: azione immediata. Reversibile via "Riattiva". */
  mute(): void {
    this.muteSelected.emit();
    this.resetCustom();
  }

  reactivateNow(): void {
    this.reactivate.emit();
    this.resetCustom();
  }

  dismiss(): void {
    this.dismissed.emit();
    this.resetCustom();
  }

  private resetCustom(): void {
    this.showCustom = false;
    this.customDate = null;
  }
}
