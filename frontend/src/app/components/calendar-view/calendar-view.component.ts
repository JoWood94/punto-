import {
  Component, Input, Output, EventEmitter,
  OnChanges, OnInit, SimpleChanges, AfterViewInit, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Note } from '../../services/note';
import { Calendar } from '../../services/calendar';
import { inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

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
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, TranslateModule],
  templateUrl: './calendar-view.component.html',
  styleUrls: ['./calendar-view.component.scss']
})
export class CalendarViewComponent implements OnChanges, OnInit, AfterViewInit {
  @Input() notes: Note[] = [];
  @Input() isMobile = false;
  @Input() initialViewType: CalendarViewType = 'month';
  @Input() calendars: Calendar[] = [];
  @Input() currentViewType: CalendarViewType | null = null;
  @Output() noteSelected = new EventEmitter<Note>();
  @Output() viewTypeChange = new EventEmitter<CalendarViewType>();
  @Output() currentDateChange = new EventEmitter<Date>();
  @Output() openFilter = new EventEmitter<void>();
  @Output() deleteEvent = new EventEmitter<Note>();

  @ViewChild('monthsContainer') monthsContainerRef?: ElementRef<HTMLElement>;
  @ViewChild('toolbarSegments') toolbarSegmentsRef?: ElementRef<HTMLElement>;

  viewType: CalendarViewType = 'month';

  /** Storage interno della data corrente. Acceduto via getter/setter per supportare @Input. */
  private _currentDate: Date = new Date();

  /** Flag per bloccare il re-emit verso il parent durante l'apply di un Input esterno */
  private suppressDateEmit = false;

  /** @Input setter: riceve la data dal parent (back-navigation da evento).
   *  Se diversa da quella interna, aggiorna la vista senza fare emit (anti-loop). */
  @Input() set currentDate(v: Date | null) {
    if (!v) return;
    const incoming = new Date(v).getTime();
    const current  = this._currentDate.getTime();
    if (incoming === current) return;
    this.suppressDateEmit = true;
    this._currentDate = new Date(v);
    // Rebuild della vista corrente per riflettere il nuovo giorno
    if (this.viewType === 'month') {
      this.isProgrammaticScroll = true;
      this.buildScrollableMonths(this._currentDate);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.scrollToCurrentMonth();
      }));
    } else {
      this.buildView();
    }
    this.suppressDateEmit = false;
  }

  /** Getter pubblico per l'uso nel template e nella classe */
  get currentDate(): Date { return this._currentDate; }

  // ── Toolbar drag indicator ──
  private readonly VIEW_SEGMENTS: CalendarViewType[] = ['day', 'week', 'month'];
  private toolbarSegWidth = 0;   // usato SOLO durante il drag live
  toolbarDragging = false;
  toolbarIndicatorTransform = this.cssTransform(this.VIEW_SEGMENTS.indexOf(this.viewType));
  private toolbarDragStartX = 0;
  private toolbarDragStartIndex = 0;

  /** Posizione a riposo: translateX(N * 100%) — 100% = larghezza indicatore = 1/3 container */
  private cssTransform(index: number): string {
    return `translateX(${index * 100}%)`;
  }

  /** Posizione durante drag: px precisi misurati dal DOM */
  private pxTransform(offset: number): string {
    return `translateX(${offset}px)`;
  }

  calendarDays: CalendarDay[] = [];
  weekDays: CalendarDay[] = [];
  dayNotes: Note[] = [];
  months: CalendarMonth[] = [];

  translationService = inject(TranslationService);

  get weekHeaders(): string[] {
    const locale = this.translationService.locale;
    // Jan 1 2024 is a Monday
    const base = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const name = d.toLocaleDateString(locale, { weekday: 'short' });
      return name.charAt(0).toUpperCase() + name.slice(1, 3);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['notes'] || changes['isMobile']) {
      this.refresh();
    }
    // Gestione runtime di currentViewType: cambia vista senza re-emit verso il parent
    if (changes['currentViewType']) {
      const newView = changes['currentViewType'].currentValue as CalendarViewType | null;
      if (newView && newView !== this.viewType) {
        // Usa _setViewSilent per non emettere viewTypeChange (il parent ha già aggiornato lastCalendarView)
        this.viewType = newView;
        const index = this.VIEW_SEGMENTS.indexOf(newView);
        this.toolbarIndicatorTransform = this.cssTransform(index);
        if (newView === 'month') {
          this.isProgrammaticScroll = true;
          this.buildScrollableMonths(this._currentDate);
          requestAnimationFrame(() => requestAnimationFrame(() => this.scrollToCurrentMonth()));
        } else {
          this.buildView();
        }
      }
    }
  }

  ngOnInit(): void {
    this.viewType = this.initialViewType;
    this.toolbarIndicatorTransform = this.cssTransform(this.VIEW_SEGMENTS.indexOf(this.viewType));
    this.refresh();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.scrollToCurrentMonth();
      // Misura segWidth solo per uso drag — la posizione visiva usa già %
      const el = this.toolbarSegmentsRef?.nativeElement;
      if (el && el.clientWidth > 0) {
        this.toolbarSegWidth = el.clientWidth / this.VIEW_SEGMENTS.length;
      }
    }, 50);
  }

  private refresh(): void {
    if (this.viewType === 'month') {
      if (this.months.length === 0) {
        this.buildScrollableMonths(this.currentDate);
      } else {
        // Aggiorna solo le note nei giorni dei mesi esistenti — NON shiftare la finestra.
        // Evita il loop runaway in cui un cambio di [notes] (getter calendarNotes nel parent)
        // ricostruirebbe i mesi centrati sul nuovo currentDate, shiftando i data-month sotto
        // lo scrollTop e auto-alimentando lo scroll.
        this.months = this.months.map(m => ({
          ...m,
          days: m.days.map(d => ({ ...d, notes: this.getNotesForDay(d.date) }))
        }));
      }
    } else {
      this.buildView();
    }
  }

  setView(view: CalendarViewType): void {
    this.viewType = view;
    this.viewTypeChange.emit(view);
    this.currentDateChange.emit(new Date(this.currentDate));
    const index = this.VIEW_SEGMENTS.indexOf(view);
    this.toolbarIndicatorTransform = this.cssTransform(index);
    if (view === 'month') {
      this.isProgrammaticScroll = true;
      this.buildScrollableMonths(this.currentDate);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.scrollToCurrentMonth();
      }));
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

    const label = firstDay.toLocaleDateString(this.translationService.locale, { month: 'long', year: 'numeric' });
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

  private isProgrammaticScroll = false;

  private scrollToCurrentMonth(): void {
    if (this.viewType !== 'month') return;
    const container = this.monthsContainerRef?.nativeElement;
    if (!container) return;
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const el = container.querySelector(`[data-month="${year}-${month}"]`) as HTMLElement | null;
    if (el) {
      // getBoundingClientRect → posizione reale relativa al viewport,
      // indipendente dall'offsetParent — evita il "taglia i primi giorni"
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop = container.scrollTop + (elRect.top - containerRect.top);
    }
    // Rilascia il lock dopo che tutti gli eventi scroll si sono esauriti
    setTimeout(() => { this.isProgrammaticScroll = false; }, 400);
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

    // Aggiorna currentDate solo se lo scroll è manuale (non programmatico)
    if (this.isProgrammaticScroll) return;
    // Usa il punto al 25% dall'alto del container come riferimento —
    // quando Today scrolla il mese in CIMA, il centro (50%) cadrebbe nel mese successivo
    // causando todayIsVisible = false. Il 25% seleziona correttamente il mese in testa.
    const cRect = container.getBoundingClientRect();
    const refY = cRect.top + container.clientHeight * 0.25;
    let found: HTMLElement | null = null;
    container.querySelectorAll<HTMLElement>('[data-month]').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.top <= refY && r.bottom > refY) { found = el; }
    });
    // Fallback: nessun mese contiene refY → prendi il più in alto ancora visibile
    if (!found) {
      let minTop = Infinity;
      container.querySelectorAll<HTMLElement>('[data-month]').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.bottom > cRect.top && r.top < minTop) { minTop = r.top; found = el; }
      });
    }
    if (found) {
      const [y, m] = (found as HTMLElement).getAttribute('data-month')!.split('-').map(Number);
      if (this._currentDate.getFullYear() !== y || this._currentDate.getMonth() !== m) {
        this._currentDate = new Date(y, m, 1);
      }
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

  dayHasReminder(day: CalendarDay): boolean {
    return day.notes.some(n => !!n.reminderTime);
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
    // Rispetta la data di fine ripetizione (confronto a livello di giorno:
    // la data di fine è mezzanotte, ma date può avere ore > 0 nelle viste settimana/giorno)
    if (note.recurrenceEndDate) {
      const endDay = new Date(note.recurrenceEndDate);
      const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endDayMidnight = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate());
      if (dateDay.getTime() > endDayMidnight.getTime()) return false;
    }
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

  // ── Multiday event helpers (Slice H) ─────────────────────────────────────────

  private getEventDays(note: Note): Date[] {
    if (note.type !== 'event') return [];
    // Slice H: usa eventStart/eventEnd come fonte di verità. Niente più fallback
    // su reminderTime: gli eventi legacy senza eventStart non sono renderizzati.
    // Questo evita i casi in cui un evento appariva in 2 giorni distinti
    // (es. eventStart e reminderTime divergenti).
    const start = (note as any).eventStart;
    if (typeof start !== 'number') {
      console.warn('[DBG-EVT-CAL] event without eventStart, skipping', { id: note.id, title: note.title, reminderTime: note.reminderTime });
      return [];
    }
    const end = (note as any).eventEnd;
    const endTs = typeof end === 'number' ? end : start;
    const startDay = new Date(new Date(start).setHours(0, 0, 0, 0));
    const endDay   = new Date(new Date(endTs).setHours(0, 0, 0, 0));
    const days: Date[] = [];
    let cursor = new Date(startDay);
    while (cursor.getTime() <= endDay.getTime()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (days.length > 1) {
      console.log('[DBG-EVT-CAL] multi-day event', {
        id: note.id, title: note.title,
        eventStart: new Date(start).toISOString(),
        eventEnd: new Date(endTs).toISOString(),
        days: days.map(d => d.toISOString().slice(0, 10)),
      });
    }
    return days;
  }

  eventDayPosition(note: Note, day: Date): 'first' | 'middle' | 'last' | 'single' | null {
    if (note.type !== 'event') return null;
    const days = this.getEventDays(note);
    if (days.length === 0) return null;
    if (days.length === 1) return 'single';
    const i = days.findIndex(d => d.toDateString() === day.toDateString());
    if (i < 0) return null;
    if (i === 0) return 'first';
    if (i === days.length - 1) return 'last';
    return 'middle';
  }

  isEventMid(note: Note, day: Date): boolean {
    return this.eventDayPosition(note, day) === 'middle';
  }

  isEventLast(note: Note, day: Date): boolean {
    return this.eventDayPosition(note, day) === 'last';
  }

  private getNotesForDay(date: Date): Note[] {
    const seen = new Set<string>();
    const result: Note[] = [];
    for (const n of this.notes) {
      // Per gli eventi: visibilità decisa SOLO da getEventDays (eventStart/End).
      // Niente fallback su getNoteDate(reminderTime/createdAt) che farebbe
      // apparire l'evento anche il giorno di creazione (bug Slice H).
      if (n.type === 'event') {
        const days = this.getEventDays(n);
        if (days.some(d => this.isSameDay(d, date))) {
          if (!seen.has(n.id ?? n.createdAt?.toString() ?? '')) {
            seen.add(n.id ?? n.createdAt?.toString() ?? '');
            result.push(n);
          }
        }
        continue;   // skip ALWAYS i fallback successivi per gli eventi
      }
      const d = this.getNoteDate(n);
      if (d && this.isSameDay(d, date)) {
        result.push(n);
        continue;
      }
      // Includi note ricorrenti (la nota originale, non una copia)
      const repeat = this.getEffectiveRepeat(n);
      if (repeat && n.reminderTime && !this.isSameDay(new Date(n.reminderTime), date)) {
        if (this.isRecurringOnDate(n, date)) result.push(n);
      }
    }
    return result;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  navigate(direction: number): void {
    const d = new Date(this._currentDate);
    if (this.viewType === 'month') d.setMonth(d.getMonth() + direction);
    else if (this.viewType === 'week') d.setDate(d.getDate() + direction * 7);
    else d.setDate(d.getDate() + direction);
    this._currentDate = d;
    this.currentDateChange.emit(new Date(this._currentDate));
    if (this.viewType === 'month') {
      this.isProgrammaticScroll = true;
      this.buildScrollableMonths(this.currentDate);
      requestAnimationFrame(() => requestAnimationFrame(() => this.scrollToCurrentMonth()));
    } else {
      this.buildView();
    }
  }

  goToToday(): void {
    this._currentDate = new Date();
    this.currentDateChange.emit(new Date(this._currentDate));
    this.toolbarIndicatorTransform = this.cssTransform(this.VIEW_SEGMENTS.indexOf(this.viewType));
    if (this.viewType === 'month') {
      // Lock immediato: blocca TUTTI gli scroll events intermedi
      // (il rebuild di months cambia scrollHeight → browser può emettere scroll events)
      this.isProgrammaticScroll = true;
      this.buildScrollableMonths(this.currentDate);
      // Double rAF: 1° frame → Angular processa il nuovo array months
      //             2° frame → browser ha fatto layout del nuovo DOM
      requestAnimationFrame(() => requestAnimationFrame(() => this.scrollToCurrentMonth()));
    } else {
      this.buildView();
    }
  }

  selectDay(day: CalendarDay): void {
    this._currentDate = new Date(day.date);
    this.currentDateChange.emit(new Date(this._currentDate));
    this.setView('day');
  }

  selectNote(note: Note, event: Event): void {
    event.stopPropagation();
    this.noteSelected.emit(note);
  }

  // ── Toolbar drag handlers (mirrors unified-toolbar in dashboard) ──
  private measureToolbarSegWidth(e: TouchEvent): void {
    const seg = (e.target as HTMLElement).closest('.calendar-toolbar-segments');
    if (seg) {
      this.toolbarSegWidth = seg.clientWidth / this.VIEW_SEGMENTS.length;
    }
  }

  onToolbarTouchStart(e: TouchEvent): void {
    // Attiva drag solo se il touch parte dentro i segmenti, non su "Oggi" o altri pulsanti
    if (!(e.target as HTMLElement).closest('.calendar-toolbar-segments')) return;
    this.measureToolbarSegWidth(e);
    this.toolbarDragging = true;
    this.toolbarDragStartX = e.touches[0].clientX;
    this.toolbarDragStartIndex = this.VIEW_SEGMENTS.indexOf(this.viewType);
  }

  onToolbarTouchMove(e: TouchEvent): void {
    if (!this.toolbarDragging) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - this.toolbarDragStartX;
    if (this.toolbarSegWidth > 0) {
      const rawOffset = this.toolbarDragStartIndex * this.toolbarSegWidth + dx;
      const maxOffset = (this.VIEW_SEGMENTS.length - 1) * this.toolbarSegWidth;
      const clamped = Math.max(0, Math.min(maxOffset, rawOffset));
      this.toolbarIndicatorTransform = this.pxTransform(clamped);
      const liveIndex = Math.max(0, Math.min(
        this.VIEW_SEGMENTS.length - 1,
        Math.round(rawOffset / this.toolbarSegWidth)
      ));
      this.viewType = this.VIEW_SEGMENTS[liveIndex];
    }
  }

  onToolbarTouchEnd(e: TouchEvent): void {
    if (!this.toolbarDragging) return;
    this.toolbarDragging = false;
    const endX = e.changedTouches[0]?.clientX ?? this.toolbarDragStartX;
    const dx = endX - this.toolbarDragStartX;
    // Tap senza spostamento reale: applica direttamente il segmento tappato.
    // Con touch-action:none sul container iOS può sopprimere il click auto
    // generato dal tap (specialmente se il dito si è mosso anche di 1-2px e
    // touchmove ha chiamato preventDefault). Risolviamo manualmente leggendo
    // il target del touchend. NB: il pill "Oggi" NON entra qui perché il suo
    // touchstart non avvia drag (è fuori da .calendar-toolbar-segments) →
    // il (click) nativo arriva normalmente.
    if (Math.abs(dx) < 8) {
      const segEl = (e.target as HTMLElement).closest('.calendar-toolbar-seg');
      if (segEl) {
        const parent = segEl.parentElement;
        const segs = parent
          ? Array.from(parent.querySelectorAll<HTMLElement>('.calendar-toolbar-seg'))
          : [];
        const index = segs.indexOf(segEl as HTMLElement);
        if (index >= 0 && index < this.VIEW_SEGMENTS.length) {
          this.setView(this.VIEW_SEGMENTS[index]);
          return;
        }
      }
      this.toolbarIndicatorTransform = this.cssTransform(this.VIEW_SEGMENTS.indexOf(this.viewType));
      return;
    }
    // Drag reale: snap all'indice più vicino
    if (this.toolbarSegWidth > 0) {
      const rawOffset = this.toolbarDragStartIndex * this.toolbarSegWidth + dx;
      const snapIndex = Math.max(0, Math.min(
        this.VIEW_SEGMENTS.length - 1,
        Math.round(rawOffset / this.toolbarSegWidth)
      ));
      this.setView(this.VIEW_SEGMENTS[snapIndex]);
    } else {
      // Fallback senza misurazione: snap basato su direzione
      const dir = dx > 0 ? -1 : 1;
      const newIndex = Math.max(0, Math.min(
        this.VIEW_SEGMENTS.length - 1,
        this.toolbarDragStartIndex + dir
      ));
      this.setView(this.VIEW_SEGMENTS[newIndex]);
    }
  }

  /**
   * Colore di accent per il chip nel calendario.
   * - type='event' con calendarId noto → colore del Calendar
   * - tutti gli altri → note.color (comportamento esistente)
   */
  getNoteAccentColor(note: Note): string {
    if (note.type === 'event' && note.calendarId) {
      const cal = this.calendars.find(c => c.id === note.calendarId);
      if (cal?.color) {
        return cal.color;
      }
    }
    return (note.color && note.color !== 'default') ? note.color : 'var(--punto-primary, #1C1B1F)';
  }

  formatTime(reminderTime: number | null | undefined): string {
    if (!reminderTime) return '';
    return new Date(reminderTime).toLocaleTimeString(this.translationService.locale, { hour: '2-digit', minute: '2-digit' });
  }

  /** Formatta il range orario di un evento. "08:00 → 10:30" se ha eventEnd,
   *  altrimenti solo "08:00". Stringa vuota se non è un evento. */
  formatEventRange(note: Note): string {
    if (note.type !== 'event' || typeof note.eventStart !== 'number') return '';
    const start = this.formatTime(note.eventStart);
    if (typeof note.eventEnd === 'number') {
      return `${start} → ${this.formatTime(note.eventEnd)}`;
    }
    return start;
  }

  /** True se l'utente corrente è owner del calendario dell'evento (può eliminarlo).
   *  Per i guest del calendario il bottone elimina non viene mostrato. */
  canDeleteEvent(note: Note): boolean {
    if (note.type !== 'event' || !note.calendarId) return false;
    const cal = this.calendars.find(c => c.id === note.calendarId);
    return cal?.myRole === 'owner';
  }

  /** Click sul bottone elimina di una event card: stop propagation per non aprire
   *  l'evento, conferma soft via dialog gestito dal parent. */
  onDeleteEventClick(event: MouseEvent, note: Note): void {
    event.stopPropagation();
    this.deleteEvent.emit(note);
  }

  onTuneClick(): void {
    this.openFilter.emit();
  }

  get todayIsVisible(): boolean {
    const today = new Date();
    switch (this.viewType) {
      case 'day':
        return this.isSameDay(this.currentDate, today);
      case 'week':
        return this.weekDays?.some(d => this.isSameDay(d.date, today)) ?? false;
      case 'month':
        return this.currentDate.getMonth() === today.getMonth()
            && this.currentDate.getFullYear() === today.getFullYear();
      default:
        return false;
    }
  }

  get headerLabel(): string {
    const locale = this.translationService.locale;
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
