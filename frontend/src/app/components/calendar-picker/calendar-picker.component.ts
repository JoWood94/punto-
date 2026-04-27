import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { Calendar } from '../../services/calendar';

@Component({
  selector: 'app-calendar-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    MatFormFieldModule,
    MatSelectModule,
    TranslateModule,
  ],
  templateUrl: './calendar-picker.component.html',
  styleUrls: ['./calendar-picker.component.scss'],
})
export class CalendarPickerComponent {
  @Input() calendars: Calendar[] = [];
  @Input() selectedCalendarId: string | null = null;
  @Input() disabled = false;

  @Output() calendarChange = new EventEmitter<string>();

  get selectedCalendar(): Calendar | undefined {
    return this.calendars.find(c => c.id === this.selectedCalendarId) ?? this.calendars[0];
  }

  onChange(newCalId: string): void {
    const from = this.selectedCalendarId;
    console.log('[DBG-EVT-CAL-PICKER] change', { from, to: newCalId });
    this.calendarChange.emit(newCalId);
  }
}
