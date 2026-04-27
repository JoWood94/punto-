import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatBottomSheetRef, MAT_BOTTOM_SHEET_DATA } from '@angular/material/bottom-sheet';
import { MatIconModule } from '@angular/material/icon';
import { Calendar } from '../../services/calendar';

export interface CalendarPickerSheetData {
  calendars: Calendar[];
  currentId: string | null;
}

export interface CalendarPickerSheetResult {
  calendarId: string;
}

@Component({
  selector: 'app-calendar-picker-sheet',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './calendar-picker-sheet.component.html',
  styleUrl: './calendar-picker-sheet.component.scss',
})
export class CalendarPickerSheetComponent {
  private ref = inject(MatBottomSheetRef<CalendarPickerSheetComponent, CalendarPickerSheetResult>);
  readonly data = inject<CalendarPickerSheetData>(MAT_BOTTOM_SHEET_DATA);
  readonly options = this.data.calendars;
  readonly currentId = this.data.currentId;

  pick(id: string): void {
    this.ref.dismiss({ calendarId: id });
  }
}
