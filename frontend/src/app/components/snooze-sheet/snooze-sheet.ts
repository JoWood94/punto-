import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
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
 * Sheet/popover per gestire la sottoscrizione reminder per-user.
 * Fase 1: unica CTA dalla campanella nell'editor. Offre:
 *  - Preset rapidi (snooze 15min/1h/8h/domani)
 *  - Data/ora personalizzata (via DatetimePicker)
 *  - "Silenzia sempre" → muted=true
 *  - "Riattiva" → muted=false + snoozedUntil=null (visibile solo se non attivo)
 */
@Component({
  selector: 'app-snooze-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule, DatetimePickerComponent],
  templateUrl: './snooze-sheet.html',
  styleUrls: ['./snooze-sheet.scss'],
})
export class SnoozeSheetComponent {
  @Input() visible = false;
  @Input() currentState: ReminderSubscriptionState | null = null;

  @Output() presetSelected = new EventEmitter<number>();
  @Output() muteSelected = new EventEmitter<void>();
  @Output() reactivate = new EventEmitter<void>();
  @Output() dismissed = new EventEmitter<void>();

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
