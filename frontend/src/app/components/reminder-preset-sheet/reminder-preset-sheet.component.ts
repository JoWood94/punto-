import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

export type ReminderPresetKey =
  | 'NONE' | 'AT_START' | 'MIN_5' | 'MIN_15' | 'HOUR_1' | 'HOUR_2' | 'DAY_1' | 'CUSTOM';

export interface ReminderPresetSheetData {
  eventStart: number;
  current: ReminderPresetKey;
}

export interface ReminderPresetSheetResult {
  key: ReminderPresetKey;
  time?: number | null;
}

interface PresetRow {
  key: ReminderPresetKey;
  labelKey: string;
  offsetMin: number | null; // null = CUSTOM
}

@Component({
  selector: 'app-reminder-preset-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './reminder-preset-sheet.component.html',
  styleUrls: ['./reminder-preset-sheet.component.scss'],
})
export class ReminderPresetSheetComponent {
  readonly data: ReminderPresetSheetData = inject(MAT_BOTTOM_SHEET_DATA);
  private readonly sheetRef = inject(MatBottomSheetRef<ReminderPresetSheetComponent>);
  readonly translationService = inject(TranslationService);

  readonly presets: PresetRow[] = [
    { key: 'NONE',     labelKey: 'EVENT.REMINDER_NONE',     offsetMin: null },
    { key: 'AT_START', labelKey: 'EVENT.REMINDER_AT_START', offsetMin: 0 },
    { key: 'MIN_5',    labelKey: 'EVENT.REMINDER_5MIN',     offsetMin: 5 },
    { key: 'MIN_15',   labelKey: 'EVENT.REMINDER_15MIN',    offsetMin: 15 },
    { key: 'HOUR_1',   labelKey: 'EVENT.REMINDER_1H',       offsetMin: 60 },
    { key: 'HOUR_2',   labelKey: 'EVENT.REMINDER_2H',       offsetMin: 120 },
    { key: 'DAY_1',    labelKey: 'EVENT.REMINDER_1DAY',     offsetMin: 60 * 24 },
    { key: 'CUSTOM',   labelKey: 'EVENT.REMINDER_CUSTOM',   offsetMin: null },
  ];

  get dateLocale(): string { return this.translationService.pipeDateLocale; }

  subLabel(preset: PresetRow): string {
    if (preset.offsetMin === null) return '';
    const t = this.data.eventStart - preset.offsetMin * 60_000;
    return new Date(t).toLocaleString(this.translationService.locale, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }

  select(preset: PresetRow): void {
    console.log('[DBG-EVT-RPS] pick', { key: preset.key });
    if (preset.key === 'NONE') {
      this.sheetRef.dismiss({ key: 'NONE', time: null } as ReminderPresetSheetResult);
      return;
    }
    if (preset.offsetMin === null) {
      this.sheetRef.dismiss({ key: 'CUSTOM' } as ReminderPresetSheetResult);
      return;
    }
    const time = this.data.eventStart - preset.offsetMin * 60_000;
    this.sheetRef.dismiss({ key: preset.key, time } as ReminderPresetSheetResult);
  }

  ngOnInit(): void {
    console.log('[DBG-EVT-RPS] opened', { eventStart: this.data.eventStart, current: this.data.current });
  }
}
