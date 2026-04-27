import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { CalendarService } from '../../services/calendar';
import { TranslationService } from '../../services/translation';

export interface AddCalendarDialogResult {
  created: true;
  calendarId: string;
}

const COLOR_PALETTE = [
  '#1C1B1F',
  '#7E57C2',
  '#42A5F5',
  '#26A69A',
  '#66BB6A',
  '#FFA726',
  '#EF5350',
  '#8D6E63',
];

type CreateState = 'idle' | 'loading' | 'error';

@Component({
  selector: 'app-add-calendar-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './add-calendar-dialog.component.html',
  styleUrls: ['./add-calendar-dialog.component.scss'],
})
export class AddCalendarDialogComponent implements OnInit, AfterViewInit {
  @ViewChild('titleInput') titleInputRef?: ElementRef<HTMLInputElement>;

  private calendarService = inject(CalendarService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private dialogRef = inject(MatDialogRef<AddCalendarDialogComponent, AddCalendarDialogResult | null>);

  title = '';
  selectedColor = '#1C1B1F';
  palette = COLOR_PALETTE;
  state = signal<CreateState>('idle');
  errorMessage = signal<string | null>(null);

  get canSubmit(): boolean {
    return this.title.trim().length > 0 && this.state() !== 'loading';
  }

  ngOnInit(): void {
    console.log('[DBG-EVT-NEW-CAL] dialog opened');
  }

  ngAfterViewInit(): void {
    this.titleInputRef?.nativeElement.focus();
  }

  pickColor(color: string): void {
    this.selectedColor = color;
    console.log('[DBG-EVT-NEW-CAL] palette pick', { color });
  }

  async onSubmit(): Promise<void> {
    if (!this.canSubmit) return;
    const title = this.title.trim();
    const color = this.selectedColor;
    console.log('[DBG-EVT-NEW-CAL] create', { title, color });
    this.state.set('loading');
    this.errorMessage.set(null);
    this.cdr.markForCheck();
    try {
      const calendarId = await this.calendarService.createCalendar({
        title,
        color,
        isDefault: false,
      });
      console.log('[DBG-EVT-NEW-CAL] success', { id: calendarId });
      this.dialogRef.close({ created: true, calendarId });
    } catch (e: any) {
      const msg = this.translationService.instant('COMMON.ERROR_GENERIC');
      console.error('[DBG-EVT-NEW-CAL] error', { message: e?.message });
      this.errorMessage.set(msg);
      this.state.set('error');
      this.cdr.markForCheck();
    }
  }

  cancel(): void {
    this.dialogRef.close(null);
  }
}
