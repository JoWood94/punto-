import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

export type ReminderPresetKey =
  | 'NONE' | 'AT_START' | 'MIN_5' | 'MIN_15' | 'HOUR_1' | 'HOUR_2' | 'DAY_1' | 'CUSTOM';

export interface ReminderPresetSheetData {
  /** Timestamp anchor: eventStart per eventi, block.time per memo. */
  eventStart: number;
  current: ReminderPresetKey;
  /** Modalità: 'event' = preset completi; 'memo' = AT_START..DAY_1+CUSTOM (no NONE). */
  mode?: 'event' | 'memo';
}

export interface ReminderPresetSheetResult {
  key: ReminderPresetKey;
  time?: number | null;
}

interface PresetRow {
  key: ReminderPresetKey;
  labelKey: string;
  offsetMin: number | null; // null = NONE o CUSTOM
}

@Component({
  selector: 'app-reminder-preset-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatFormFieldModule, MatInputModule, TranslateModule],
  templateUrl: './reminder-preset-sheet.component.html',
  styleUrls: ['./reminder-preset-sheet.component.scss'],
})
export class ReminderPresetSheetComponent {
  readonly data: ReminderPresetSheetData = inject(MAT_BOTTOM_SHEET_DATA);
  private readonly sheetRef = inject(MatBottomSheetRef<ReminderPresetSheetComponent>);
  readonly translationService = inject(TranslationService);

  /** Stato inline per CUSTOM in memo mode. */
  readonly customDatetimeValue = signal<string>('');
  readonly customError = signal<string>('');
  readonly showCustomInline = signal<boolean>(false);

  private readonly allPresets: PresetRow[] = [
    { key: 'NONE',     labelKey: 'EVENT.REMINDER_NONE',     offsetMin: null },
    { key: 'AT_START', labelKey: 'EVENT.REMINDER_AT_START', offsetMin: 0 },
    { key: 'MIN_5',    labelKey: 'EVENT.REMINDER_5MIN',     offsetMin: 5 },
    { key: 'MIN_15',   labelKey: 'EVENT.REMINDER_15MIN',    offsetMin: 15 },
    { key: 'HOUR_1',   labelKey: 'EVENT.REMINDER_1H',       offsetMin: 60 },
    { key: 'HOUR_2',   labelKey: 'EVENT.REMINDER_2H',       offsetMin: 120 },
    { key: 'DAY_1',    labelKey: 'EVENT.REMINDER_1DAY',     offsetMin: 60 * 24 },
    { key: 'CUSTOM',   labelKey: 'EVENT.REMINDER_CUSTOM',   offsetMin: null },
  ];

  /**
   * Preset visibili:
   * - event: tutti (NONE..DAY_1, CUSTOM)
   * - memo: AT_START..DAY_1 + CUSTOM. Nessun NONE (il toggle Mute gestisce "nessuna notifica").
   */
  get presets(): PresetRow[] {
    if (this.data.mode === 'memo') {
      return this.allPresets.filter(p => p.key !== 'NONE');
    }
    return this.allPresets;
  }

  /** Label AT_START adattata al contesto. */
  labelFor(preset: PresetRow): string {
    if (preset.key === 'AT_START' && this.data.mode === 'memo') {
      return 'MEMO.REMINDER_AT_TIME';
    }
    return preset.labelKey;
  }

  get dateLocale(): string { return this.translationService.pipeDateLocale; }

  subLabel(preset: PresetRow): string {
    if (preset.offsetMin === null) return '';
    const t = this.data.eventStart - preset.offsetMin * 60_000;
    return new Date(t).toLocaleString(this.translationService.locale, {
      weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Max consentito per datetime-local: esclude l'orario uguale o posteriore a block.time.
   *  Formato stringa ISO locale `YYYY-MM-DDTHH:mm` (senza secondi, per compatibilità browser). */
  get customMaxDatetime(): string {
    // Sottrai 1 minuto: l'input max è esclusivo — qualsiasi valore <= anchor-1min è valido.
    const d = new Date(this.data.eventStart - 60_000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** Valore default per l'input datetime-local CUSTOM in memo mode.
   *  Propone `block.time - 5 min` come suggerimento iniziale, clampato a now. */
  private get customDefaultValue(): string {
    const anchor = this.data.eventStart;
    // Suggerisci 15 minuti prima se ragionevole, altrimenti usa l'ancora stessa
    const suggested = anchor - 15 * 60_000;
    const ts = suggested > Date.now() ? suggested : anchor;
    const d = new Date(ts);
    // Formato: YYYY-MM-DDTHH:mm (input[type=datetime-local])
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  select(preset: PresetRow): void {
    if (preset.key === 'NONE') {
      this.sheetRef.dismiss({ key: 'NONE', time: null } as ReminderPresetSheetResult);
      return;
    }
    if (preset.key === 'CUSTOM') {
      if (this.data.mode === 'memo') {
        // Espandi inline l'input datetime invece di chiudere e delegare al chiamante
        this.customDatetimeValue.set(this.customDefaultValue);
        this.customError.set('');
        this.showCustomInline.set(true);
        return;
      }
      // Event mode: delega al chiamante (dialog separato)
      this.sheetRef.dismiss({ key: 'CUSTOM' } as ReminderPresetSheetResult);
      return;
    }
    if (preset.offsetMin === null) {
      // Fallback (non dovrebbe accadere con la struttura attuale)
      this.sheetRef.dismiss({ key: preset.key } as ReminderPresetSheetResult);
      return;
    }
    const time = this.data.eventStart - preset.offsetMin * 60_000;
    this.sheetRef.dismiss({ key: preset.key, time } as ReminderPresetSheetResult);
  }

  /** Conferma il datetime CUSTOM inline (memo mode). */
  confirmCustom(): void {
    const raw = this.customDatetimeValue();
    if (!raw) {
      this.customError.set('MEMO.REMINDER_CUSTOM_REQUIRED');
      return;
    }
    const ts = new Date(raw).getTime();
    if (isNaN(ts)) {
      this.customError.set('EVENT.REMINDER_CUSTOM_INVALID');
      return;
    }
    if (ts >= this.data.eventStart) {
      // Orario scelto non è anticipato rispetto a block.time
      this.customError.set('MEMO.REMINDER_CUSTOM_AFTER');
      return;
    }
    this.customError.set('');
    this.sheetRef.dismiss({ key: 'CUSTOM', time: ts } as ReminderPresetSheetResult);
  }

  /** Annulla l'espansione inline e torna alla lista preset. */
  cancelCustom(): void {
    this.showCustomInline.set(false);
    this.customError.set('');
  }

  ngOnInit(): void {
    console.log('[DBG-EVT-RPS] opened', { eventStart: this.data.eventStart, current: this.data.current, mode: this.data.mode });
  }
}
