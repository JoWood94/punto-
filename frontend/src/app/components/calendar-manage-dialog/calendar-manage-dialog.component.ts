import { Component, EventEmitter, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '../../services/auth';
import { Calendar, CalendarService } from '../../services/calendar';
import { ToastService } from '../../services/toast';
import { TranslationService } from '../../services/translation';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { firstValueFrom } from 'rxjs';

export interface CalendarManageDialogData {
  calendar: Calendar;
}

export interface CalendarManageDialogResult {
  updated?: boolean;
  deleted?: boolean;
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

@Component({
  selector: 'app-calendar-manage-dialog',
  standalone: true,
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
  templateUrl: './calendar-manage-dialog.component.html',
  styleUrls: ['./calendar-manage-dialog.component.scss'],
})
export class CalendarManageDialogComponent implements OnInit {
  title: string;
  color: string;
  isDefault: boolean;
  palette = COLOR_PALETTE;

  inviteCode: string | null = null;
  inviteLoading = false;

  readonly calendarChange = new EventEmitter<{ title: string; color: string }>();

  constructor(
    public dialogRef: MatDialogRef<CalendarManageDialogComponent, CalendarManageDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: CalendarManageDialogData,
    private authService: AuthService,
    private calendarService: CalendarService,
    private matDialog: MatDialog,
    private toast: ToastService,
    private translationService: TranslationService,
  ) {
    this.title = data.calendar.title;
    this.color = data.calendar.color ?? '#1C1B1F';
    this.isDefault = data.calendar.isDefault === true;
  }

  get isOwned(): boolean {
    const me = this.authService.getCurrentUserId();
    return !!me && this.data.calendar.uid === me;
  }

  ngOnInit(): void {
    console.log('[DBG-EVT-MANAGE] opened', {
      id: this.data.calendar.id,
      title: this.data.calendar.title,
      isDefault: this.isDefault,
    });
  }

  pickColor(c: string): void {
    this.color = c;
    this.persistCalendar({ color: c });
  }

  onTitleBlur(): void {
    const trimmed = this.title.trim();
    if (!trimmed || trimmed === this.data.calendar.title) return;
    this.persistCalendar({ title: trimmed });
  }

  private persistCalendar(partial: Partial<Pick<Calendar, 'title' | 'color'>>): void {
    if ('title' in partial) this.data.calendar.title = partial.title!;
    if ('color' in partial) this.data.calendar.color = partial.color!;
    this.calendarChange.emit({ title: this.data.calendar.title, color: this.data.calendar.color ?? '#1C1B1F' });
    this.calendarService.updateCalendar(this.data.calendar.id!, partial)
      .catch(() => this.toast.show(this.translationService.instant('COMMON.ERROR_GENERIC')));
  }

  async generateCode(): Promise<void> {
    this.inviteLoading = true;
    try {
      const token = await this.calendarService.createCalendarInvite(this.data.calendar.id!);
      this.inviteCode = token;
      console.log('[DBG-EVT-MANAGE] generate code success');
    } catch {
      this.toast.show(this.translationService.instant('COMMON.ERROR_GENERIC'));
    } finally {
      this.inviteLoading = false;
    }
  }

  copyCode(): void {
    if (!this.inviteCode) return;
    navigator.clipboard.writeText(this.inviteCode).then(() => {
      this.toast.show(this.translationService.instant('CALENDAR.COPY_SUCCESS'));
    }).catch(() => {
      this.toast.show(this.translationService.instant('COMMON.ERROR_GENERIC'));
    });
  }

  async confirmDelete(): Promise<void> {
    console.log('[DBG-EVT-MANAGE] delete confirm requested');
    const message = this.translationService.instant('CALENDAR.DELETE_CONFIRM', {
      name: this.data.calendar.title,
    });
    const confirmed = await firstValueFrom(
      this.matDialog.open(ConfirmDialogComponent, {
        data: {
          title: this.translationService.instant('CALENDAR.DELETE'),
          message,
          confirmLabel: this.translationService.instant('COMMON.DELETE'),
          cancelLabel: this.translationService.instant('COMMON.CANCEL'),
        },
      }).afterClosed()
    );
    if (!confirmed) return;
    try {
      console.log('[DBG-EVT-MANAGE] delete attempt', { id: this.data.calendar.id, isDefault: this.data.calendar.isDefault });
      await this.calendarService.deleteCalendar(this.data.calendar.id!);
      console.log('[DBG-EVT-MANAGE] delete success', this.data.calendar.id);
      this.dialogRef.close({ deleted: true });
    } catch (err: any) {
      console.error('[DBG-EVT-MANAGE] delete FAILED', {
        code: err?.code,
        message: err?.message,
        name: err?.name,
        full: err,
      });
      this.toast.show(this.translationService.instant('COMMON.ERROR_GENERIC'));
    }
  }

  close(): void {
    this.dialogRef.close({});
  }
}
