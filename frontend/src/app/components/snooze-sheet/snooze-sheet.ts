import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

export interface SnoozePreset {
  labelKey: string;
  getTime: () => number;
}

@Component({
  selector: 'app-snooze-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule, TranslateModule],
  templateUrl: './snooze-sheet.html',
  styleUrls: ['./snooze-sheet.scss'],
})
export class SnoozeSheetComponent {
  @Input() visible = false;
  @Output() presetSelected = new EventEmitter<number>();
  @Output() dismissed = new EventEmitter<void>();

  translationService = inject(TranslationService);

  readonly presets: SnoozePreset[] = [
    {
      labelKey: 'EDITOR.SNOOZE_15MIN',
      getTime: () => Date.now() + 15 * 60 * 1000,
    },
    {
      labelKey: 'EDITOR.SNOOZE_1H',
      getTime: () => Date.now() + 3600 * 1000,
    },
    {
      labelKey: 'EDITOR.SNOOZE_8H',
      getTime: () => Date.now() + 8 * 3600 * 1000,
    },
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

  select(preset: SnoozePreset) {
    this.presetSelected.emit(preset.getTime());
  }

  dismiss() {
    this.dismissed.emit();
  }
}
