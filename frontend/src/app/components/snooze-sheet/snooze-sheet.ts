import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener,
  Input, OnChanges, Output, QueryList, SimpleChanges, ViewChildren, inject,
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
export class SnoozeSheetComponent implements OnChanges, AfterViewInit {
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

  // Confirm-on-second-tap per "Silenzia sempre": primo tap → pending, secondo tap → emit.
  // Timeout automatico di 3s per reset.
  muteConfirmPending = false;
  private muteConfirmTimeout: ReturnType<typeof setTimeout> | null = null;

  get isMuted(): boolean { return !!this.currentState?.muted; }
  get isSnoozedActive(): boolean {
    const until = this.currentState?.snoozedUntil ?? 0;
    return until > Date.now();
  }
  get canReactivate(): boolean { return this.isMuted || this.isSnoozedActive; }

  get tomorrowMinDate(): Date { return new Date(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible'] && !changes['visible'].currentValue) {
      this.resetCustom();
      this.resetMuteConfirm();
    } else if (changes['visible'] && changes['visible'].currentValue) {
      // Auto-focus prima pill all'apertura (deferred fino al render)
      queueMicrotask(() => this.focusFirstInteractivePill());
    }
  }

  ngAfterViewInit(): void {
    if (this.visible) queueMicrotask(() => this.focusFirstInteractivePill());
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
    this.resetMuteConfirm();
  }

  toggleCustom(): void {
    this.showCustom = !this.showCustom;
    if (!this.showCustom) this.customDate = null;
    this.resetMuteConfirm();
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

  /** Silenzia sempre: richiede doppio tap (confirm). Reset automatico 3s. */
  mute(): void {
    if (!this.muteConfirmPending) {
      this.muteConfirmPending = true;
      if (this.muteConfirmTimeout) clearTimeout(this.muteConfirmTimeout);
      this.muteConfirmTimeout = setTimeout(() => this.resetMuteConfirm(), 3000);
      return;
    }
    this.muteSelected.emit();
    this.resetCustom();
    this.resetMuteConfirm();
  }

  reactivateNow(): void {
    this.reactivate.emit();
    this.resetCustom();
    this.resetMuteConfirm();
  }

  dismiss(): void {
    this.dismissed.emit();
    this.resetCustom();
    this.resetMuteConfirm();
  }

  private resetCustom(): void {
    this.showCustom = false;
    this.customDate = null;
  }

  private resetMuteConfirm(): void {
    this.muteConfirmPending = false;
    if (this.muteConfirmTimeout) {
      clearTimeout(this.muteConfirmTimeout);
      this.muteConfirmTimeout = null;
    }
  }
}
