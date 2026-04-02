import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, AfterViewInit, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Note } from '../../services/note';

export type CalendarViewType = 'day' | 'week' | 'month';

export interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  notes: Note[];
}

export interface CalendarMonth {
  year: number;
  month: number;   // 0-based
  label: string;   // es. "Aprile 2026"
  days: CalendarDay[]; // 42 giorni (6 settimane)
}

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule],
  templateUrl: './calendar-view.component.html',
  styleUrls: ['./calendar-view.component.scss']
})
export class CalendarViewComponent implements OnChanges, AfterViewInit {
  @Input() notes: Note[] = [];
  @Input() isMobile = false;
  @Output() noteSelected = new EventEmitter<Note>();

  @ViewChild('monthsContainer') monthsContainerRef?: ElementRef<HTMLElement>;

  viewType: CalendarViewType = 'month';
  currentDate = new Date();

  calendarDays: CalendarDay[] = [];
  weekDays: CalendarDay[] = [];
  dayNotes: Note[] = [];
  months: CalendarMonth[] = [];

  readonly weekHeaders = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['notes'] || changes['isMobile']) {
      this.refresh();
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.scrollToCurrentMonth(), 50);
  }

  private refresh(): void {
    if (this.isMobile && this.viewType === 'month') {
      this.buildScrollableMonths(this.currentDate);
    } else {
      this.buildView();
    }
  }

  setView(view: CalendarViewType): void {
    this.viewType = view;
    if (this.isMobile && view === 'month') {
      this.buildScrollableMonths(this.currentDate);
      setTimeout(() => this.scrollToCurrentMonth(), 50);
    } else {
      this.buildView();
    }
  }

  buildView(): void {
    switch (this.viewType) {
      case 'month': this.buildMonthView(); break;
      case 'week':  this.buildWeekView();  break;
      case 'day':   this.buildDayView();   break;
    }
  }

  private buildMonthView(): void {
    const year  = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const today = new Date();

    const startDate = new Date(firstDay);
    const dow = startDate.getDay(); // 0=Sun
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    startDate.setDate(startDate.getDate() - mondayOffset);

    this.calendarDays = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return {
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, today),
        notes: this.getNotesForDay(date)
      };
    });
  }

  private buildMonth(year: number, month: number): CalendarMonth {
    const firstDay = new Date(year, month, 1);
    const today = new Date();
    const startDate = new Date(firstDay);
    const dow = startDate.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    startDate.setDate(startDate.getDate() - mondayOffset);

    const days = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      return {
        date,
        isCurrentMonth: date.getMonth() === month,
        isToday: this.isSameDay(date, today),
        notes: this.getNotesForDay(date)
      };
    });

    const label = firstDay.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    return { year, month, label, days };
  }

  buildScrollableMonths(centerDate: Date): void {
    const result: CalendarMonth[] = [];
    for (let offset = -3; offset <= 3; offset++) {
      const d = new Date(centerDate.getFullYear(), centerDate.getMonth() + offset, 1);
      result.push(this.buildMonth(d.getFullYear(), d.getMonth()));
    }
    this.months = result;
  }

  private scrollToCurrentMonth(): void {
    if (!this.isMobile || this.viewType !== 'month') return;
    const container = this.monthsContainerRef?.nativeElement;
    if (!container) return;
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const el = container.querySelector(`[data-month="${year}-${month}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
  }

  onMonthsScroll(event: Event): void {
    const container = event.target as HTMLElement;
    const threshold = 200;

    // Vicino all'inizio: prepend mese precedente
    if (container.scrollTop < threshold && this.months.length > 0) {
      const first = this.months[0];
      const d = new Date(first.year, first.month - 1, 1);
      const newMonth = this.buildMonth(d.getFullYear(), d.getMonth());
      const prevScrollHeight = container.scrollHeight;
      this.months = [newMonth, ...this.months];
      setTimeout(() => {
        container.scrollTop += container.scrollHeight - prevScrollHeight;
      });
    }

    // Vicino alla fine: append mese successivo
    if (container.scrollTop + container.clientHeight > container.scrollHeight - threshold && this.months.length > 0) {
      const last = this.months[this.months.length - 1];
      const d = new Date(last.year, last.month + 1, 1);
      this.months = [...this.months, this.buildMonth(d.getFullYear(), d.getMonth())];
    }
  }

  private buildWeekView(): void {
    const today = new Date();
    const start = new Date(this.currentDate);
    const dow = start.getDay();
    const mondayOffset = dow === 0 ? 6 : dow - 1;
    start.setDate(start.getDate() - mondayOffset);

    this.weekDays = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return {
        date,
        isCurrentMonth: true,
        isToday: this.isSameDay(date, today),
        notes: this.getNotesForDay(date)
      };
    });
  }

  private buildDayView(): void {
    this.dayNotes = this.getNotesForDay(this.currentDate);
  }

  hasReminder(note: Note): boolean {
    return !!note.reminderTime;
  }

  hasReminderRepeat(note: Note): boolean {
    return !!note.reminderRepeat;
  }

  private getNoteDate(note: Note): Date | null {
    if (note.reminderTime) return new Date(note.reminderTime);
    if (note.createdAt)    return new Date(note.createdAt);
    return null;
  }

  /** Restituisce il valore di ricorrenza effettivo: preferisce reminderRepeat (nuovo),
   *  cade su recurrence (legacy) se presente e diverso da 'none'. */
  private getEffectiveRepeat(note: Note): 'daily' | 'weekly' | 'monthly' | 'yearly' | null {
    if (note.reminderRepeat) return note.reminderRepeat;
    if (note.recurrence && note.recurrence !== 'none') return note.recurrence as 'daily' | 'weekly' | 'monthly' | 'yearly';
    return null;
  }

  private isRecurringOnDate(note: Note, date: Date): boolean {
    const repeat = this.getEffectiveRepeat(note);
    if (!repeat || !note.reminderTime) return false;
    const origin = new Date(note.reminderTime);
    // La data richiesta deve essere successiva all'origin (o uguale)
    if (date < origin && !this.isSameDay(date, origin)) return false;
    switch (repeat) {
      case 'daily':
        return true;
      case 'weekly':
        return date.getDay() === origin.getDay();
      case 'monthly':
        return date.getDate() === origin.getDate();
      case 'yearly':
        return date.getDate() === origin.getDate() && date.getMonth() === origin.getMonth();
      default:
        return false;
    }
  }

  private getNotesForDay(date: Date): Note[] {
    return this.notes.filter(n => {
      const d = this.getNoteDate(n);
      if (d && this.isSameDay(d, date)) return true;
      // Includi note ricorrenti (la nota originale, non una copia)
      const repeat = this.getEffectiveRepeat(n);
      if (repeat && n.reminderTime && !this.isSameDay(new Date(n.reminderTime), date)) {
        return this.isRecurringOnDate(n, date);
      }
      return false;
    });
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  navigate(direction: number): void {
    const d = new Date(this.currentDate);
    if (this.viewType === 'month') d.setMonth(d.getMonth() + direction);
    else if (this.viewType === 'week') d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction);
    this.currentDate = d;
    if (this.isMobile && this.viewType === 'month') {
      this.buildScrollableMonths(this.currentDate);
      setTimeout(() => this.scrollToCurrentMonth(), 50);
    } else {
      this.buildView();
    }
  }

  goToToday(): void {
    this.currentDate = new Date();
    if (this.isMobile && this.viewType === 'month') {
      this.buildScrollableMonths(this.currentDate);
      setTimeout(() => this.scrollToCurrentMonth(), 50);
    } else {
      this.buildView();
    }
  }

  selectDay(day: CalendarDay): void {
    this.currentDate = new Date(day.date);
    this.viewType = 'day';
    this.buildDayView();
  }

  selectNote(note: Note, event: Event): void {
    event.stopPropagation();
    this.noteSelected.emit(note);
  }

  formatTime(reminderTime: number | null | undefined): string {
    if (!reminderTime) return '';
    return new Date(reminderTime).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  }

  get headerLabel(): string {
    const locale = 'it-IT';
    if (this.viewType === 'month') {
      return this.currentDate.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    }
    if (this.viewType === 'week') {
      const start = new Date(this.currentDate);
      const dow = start.getDay();
      start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return `${start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
    }
    return this.currentDate.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}
