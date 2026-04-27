import { Component, EventEmitter, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { NoteService } from '../../services/note';
import { Calendar } from '../../services/calendar';
import { AuthService } from '../../services/auth';

export interface CalendarFilterDialogData {
  calendars: Calendar[];
  currentUid?: string;
}

export interface CalendarFilterDialogResult {
  applied?: boolean;
  manage?: string;
  addCalendar?: boolean;  // @deprecated: usare newCalendar
  newCalendar?: boolean;
  unsubscribe?: string;
}

interface CalendarPref {
  showMemos: boolean;
  hiddenCalendarIds: string[];
}

@Component({
  selector: 'app-calendar-filter-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatCheckboxModule,
    MatIconModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './calendar-filter-dialog.component.html',
  styleUrls: ['./calendar-filter-dialog.component.scss'],
})
export class CalendarFilterDialogComponent implements OnInit {
  showMemos = true;
  showAllNotes = false;
  hiddenCalendarIds = new Set<string>();
  currentUid: string | null = null;

  readonly prefsChange = new EventEmitter<{ showMemos: boolean; showAllNotes: boolean; hiddenCalendarIds: string[] }>();

  constructor(
    public dialogRef: MatDialogRef<CalendarFilterDialogComponent, CalendarFilterDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: CalendarFilterDialogData,
    private noteService: NoteService,
    private authService: AuthService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUid = this.data.currentUid ?? this.authService.getCurrentUserId();

    const [pref, showAllNotes] = await Promise.all([
      this.noteService.getUserPreference<CalendarPref>('calendarView', {
        showMemos: true,
        hiddenCalendarIds: [],
      }),
      this.noteService.getUserPreference<boolean>('calendarShowAllNotes', false),
    ]);

    const resolved = pref ?? { showMemos: true, hiddenCalendarIds: [] };
    this.showMemos = resolved.showMemos;
    this.hiddenCalendarIds = new Set(resolved.hiddenCalendarIds);
    this.showAllNotes = showAllNotes ?? false;

    console.log('[DBG-EVT-FILTER] dialog opened', {
      calsCount: this.data.calendars.length,
      showMemos: this.showMemos,
      showAllNotes: this.showAllNotes,
      hiddenCount: this.hiddenCalendarIds.size,
    });
  }

  toggleCalendar(calId: string): void {
    if (this.hiddenCalendarIds.has(calId)) {
      this.hiddenCalendarIds.delete(calId);
    } else {
      this.hiddenCalendarIds.add(calId);
    }
    this.persistPrefs();
  }

  toggleShowMemos(): void {
    this.showMemos = !this.showMemos;
    this.persistPrefs();
  }

  toggleShowAllNotes(): void {
    this.showAllNotes = !this.showAllNotes;
    this.persistPrefs();
  }

  private persistPrefs(): void {
    const hiddenCalendarIds = Array.from(this.hiddenCalendarIds);
    this.prefsChange.emit({ showMemos: this.showMemos, showAllNotes: this.showAllNotes, hiddenCalendarIds });
    Promise.all([
      this.noteService.setUserPreference('calendarView', {
        showMemos: this.showMemos,
        hiddenCalendarIds,
      }),
      this.noteService.setUserPreference('calendarShowAllNotes', this.showAllNotes),
    ]).catch(err => console.error('[calendar-filter] persistPrefs failed', err));
  }

  isCalendarVisible(calId: string): boolean {
    return !this.hiddenCalendarIds.has(calId);
  }

  isOwned(cal: Calendar): boolean {
    return cal.uid === this.currentUid;
  }

  openManage(cal: Calendar, evt?: MouseEvent): void {
    evt?.stopPropagation();
    console.log('[DBG-EVT-FILTER] manage requested', { calId: cal.id });
    this.dialogRef.close({ manage: cal.id });
  }

  openAddCalendar(): void {
    console.log('[DBG-EVT-FILTER] open new calendar');
    this.dialogRef.close({ newCalendar: true });
  }

  requestUnsubscribe(cal: Calendar, evt: MouseEvent): void {
    evt.stopPropagation();
    console.log('[DBG-EVT-FILTER] unsubscribe requested', cal.id);
    this.dialogRef.close({ unsubscribe: cal.id });
  }

  close(): void {
    this.dialogRef.close({});
  }
}
