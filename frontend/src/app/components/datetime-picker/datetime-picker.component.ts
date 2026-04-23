import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

/**
 * Picker riusabile: data (via mat-datepicker) + ora + minuti (select).
 * Estratto dalla reminder-strip del note-editor per condivisione fra:
 *  - reminder picker (note-editor)
 *  - snooze dialog (Fase 1 campanella)
 *  - event picker (Fase 4)
 *
 * Emette `valueChange` con Date unificata ogni volta che uno dei 3 campi cambia.
 * Se `value` è null, il componente mostra stato "Seleziona data".
 */
@Component({
  selector: 'app-datetime-picker',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDatepickerModule, MatNativeDateModule, MatIconModule,
    TranslateModule,
  ],
  templateUrl: './datetime-picker.component.html',
  styleUrl: './datetime-picker.component.scss',
})
export class DatetimePickerComponent implements OnChanges {
  /** Valore corrente (Date con data + ora). null = nessuna selezione. */
  @Input() value: Date | null = null;
  /** Granularità minuti per il select (default 5). Usa 1 per precisione al minuto. */
  @Input() minuteStep = 5;
  /** Disabilita tutti i controlli. */
  @Input() disabled = false;
  /** Data minima selezionabile (default: nessun limite). */
  @Input() minDate: Date | null = null;
  /** Label mostrato quando non c'è valore (fallback i18n `DATETIME.SELECT_DATE`). */
  @Input() placeholder?: string;
  /** Output emesso quando cambia data o ora. */
  @Output() valueChange = new EventEmitter<Date | null>();

  localDate: Date | null = null;
  hour = '12';
  minute = '00';

  private translationService = inject(TranslationService);

  get dateLocale(): string { return this.translationService.pipeDateLocale; }

  get hours(): string[] {
    return Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  }

  get minutes(): string[] {
    const step = Math.max(1, Math.min(30, this.minuteStep));
    const arr: string[] = [];
    for (let m = 0; m < 60; m += step) arr.push(String(m).padStart(2, '0'));
    return arr;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value']) this.syncFromValue();
  }

  private syncFromValue(): void {
    if (!this.value) {
      this.localDate = null;
      // mantieni default 12:00 per hour/minute quando è null
      return;
    }
    this.localDate = new Date(this.value);
    this.hour = String(this.value.getHours()).padStart(2, '0');
    const step = Math.max(1, this.minuteStep);
    const snapped = Math.floor(this.value.getMinutes() / step) * step;
    this.minute = String(snapped).padStart(2, '0');
  }

  onFieldChange(): void {
    if (!this.localDate) {
      this.valueChange.emit(null);
      return;
    }
    const d = new Date(this.localDate);
    d.setHours(parseInt(this.hour, 10) || 0, parseInt(this.minute, 10) || 0, 0, 0);
    this.valueChange.emit(d);
  }
}
