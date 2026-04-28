import {
  Component, Input, Output, EventEmitter, inject, OnInit, OnChanges, OnDestroy,
  SimpleChanges, ViewChildren, ViewChild, QueryList, ElementRef, ChangeDetectorRef,
  AfterViewInit, AfterViewChecked, DoCheck, signal, NgZone, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule, MatDatepicker } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatBottomSheet, MatBottomSheetModule } from '@angular/material/bottom-sheet';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

import {
  NoteService, Note, NoteBlock, NoteType, TextBlock, ChecklistBlock,
  LocationBlock, ReminderBlock, ImageBlock, LinkBlock, migrateToBlocks, PresenceEntry
} from '../../services/note';
import { AuthService } from '../../services/auth';
import { LinkDialogComponent } from '../link-dialog/link-dialog';
import { SharingPanelComponent } from '../sharing-panel/sharing-panel';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';
import { CryptoService } from '../../services/crypto';
import { ToastService } from '../../services/toast';
import { SnoozeSheetComponent } from '../snooze-sheet/snooze-sheet';
import { ImageProcessorService } from '../../services/image-processor.service';
import { Calendar } from '../../services/calendar';
import {
  ReminderPresetSheetComponent, ReminderPresetSheetData, ReminderPresetSheetResult, ReminderPresetKey
} from '../reminder-preset-sheet/reminder-preset-sheet.component';
import {
  EventReminderCustomDialogComponent,
  EventReminderCustomDialogData,
  EventReminderCustomDialogResult,
} from '../event-reminder-custom-dialog/event-reminder-custom-dialog.component';
import {
  CalendarPickerSheetComponent, CalendarPickerSheetData, CalendarPickerSheetResult
} from '../calendar-picker-sheet/calendar-picker-sheet.component';
// TODO: import Storage riabilitare con piano Firebase Storage
// import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
// import { getApp } from 'firebase/app';


@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatAutocompleteModule,
    MatCheckboxModule, MatDatepickerModule, MatNativeDateModule,
    MatSelectModule, MatChipsModule, MatMenuModule, MatDialogModule, MatBottomSheetModule,
    DragDropModule, TranslateModule,
    SnoozeSheetComponent,
    CalendarPickerSheetComponent,
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss'],
  host: {
    '[class.editor-readonly-event]': 'isReadOnlyEvent',
  },
})
export class NoteEditorComponent implements OnInit, OnChanges, DoCheck, AfterViewInit, AfterViewChecked, OnDestroy {
  @Input() selectedNote: Note | null = null;
  @Input() initialReminderDate?: Date;
  /**
   * Tipo iniziale per la creazione di una nuova nota (selectedNote == null).
   * Passato dal CreateFabComponent in Fase 1. Default 'note' per back-compat.
   * Ignorato quando selectedNote è valorizzato (editing di doc esistente).
   */
  @Input() initialNoteType: NoteType = 'note';
  /** calendarId pre-risolto dal dashboard (Fase 4 A.1). Usato per eventi nuovi. */
  @Input() initialCalendarId?: string;
  /** Calendari owned dall'utente corrente (Fase 4 G). Passato dal dashboard. */
  @Input() ownedCalendars: Calendar[] = [];
  /** Tutti i calendari visibili (owned + subscribed). Usato per lookup read-only su eventi guest. */
  @Input() allCalendars: Calendar[] = [];
  /** Emette la nota corrente (o null) per permettere al dashboard di sincronizzare la vista. */
  @Output() closeEditor = new EventEmitter<Partial<Note> | null>();
  @Output() noteCreated = new EventEmitter<string>();
  @Output() noteLiveUpdate = new EventEmitter<{id: string, title: string}>();

  /** Collects only #textBlockEl refs (one per text block, in ngFor order). */
  @ViewChildren('textBlockEl') textBlockEls!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('editorContent') editorContent!: ElementRef<HTMLElement>;
  @ViewChild('titleInput') titleInputRef!: ElementRef<HTMLInputElement>;
  /** Datepicker nascosti per event start/end nel nuovo layout inline. */
  @ViewChild('eventStartDp') eventStartDp?: MatDatepicker<Date>;
  @ViewChild('eventEndDp') eventEndDp?: MatDatepicker<Date>;
  /** Datepicker nascosto per memo start (nuovo header). */
  @ViewChild('memoStartDp') memoStartDp?: MatDatepicker<Date>;
  /** Datepicker nascosto per memo recurrenceEndDate. */
  @ViewChild('memoEndDp') memoEndDp?: MatDatepicker<Date>;

  note: Partial<Note> & { blocks: NoteBlock[]; tags: string[] } = {
    title: '',
    blocks: [],
    tags: [],
    color: 'default'
  };

  // Rich-text formatting state (reflects the active text block)
  readonly isBold = signal(false);
  readonly isItalic = signal(false);
  readonly isUnderline = signal(false);
  readonly isStrikethrough = signal(false);
  readonly isList = signal(false);
  readonly isOrderedList = signal(false);
  readonly activeTextBlockIndex = signal<number | null>(null);
  /** Indice del blocco "in interazione": rivela il trigger menu (3 dots).
   *  Settato da click sul blocco e da focus dei text block. Resettato al
   *  click fuori dai blocchi (cfr. onDocumentClickReset). */
  readonly activeBlockIndex = signal<number | null>(null);
  /** true quando la tastiera virtuale è aperta (detection via visualViewport).
   *  Usato per nascondere i floating button mobile mentre si digita. */
  readonly keyboardOpen = signal(false);
  private vvResizeListener: (() => void) | null = null;

  // Add-block speed dial state
  readonly addBlockMenuOpen = signal(false);

  // True quando il focus è su un campo form non-testo (es. input[type=time]):
  // nasconde la floating-toolbar-area per evitare sovrapposizione su iOS.
  readonly nonTextFieldFocused = signal(false);

  // TODO: tags disabilitati temporaneamente
  // tagInput = '';

  hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  // TODO: uploadProgress riabilitare con piano Firebase Storage
  // uploadProgress = new Map<number, number>(); // blockIndex → upload %

  // ─── Event fields (Slice H) ───────────────────────────────────────────────
  /** True se l'evento ha una durata (eventEnd valorizzato). */
  get hasDuration(): boolean { return typeof this.note.eventEnd === 'number'; }

  reminderEnabled = false;
  reminderPresetKey: ReminderPresetKey = 'HOUR_1';

  get reminderPresetLabel(): string {
    const map: Record<string, string> = {
      NONE:     'EVENT.REMINDER_NONE',
      AT_START: 'EVENT.REMINDER_AT_START',
      MIN_5:    'EVENT.REMINDER_5MIN',
      MIN_15:   'EVENT.REMINDER_15MIN',
      HOUR_1:   'EVENT.REMINDER_1H',
      HOUR_2:   'EVENT.REMINDER_2H',
      DAY_1:    'EVENT.REMINDER_1DAY',
      CUSTOM:   'EVENT.REMINDER_CUSTOM',
    };
    return map[this.reminderPresetKey] ?? 'EVENT.REMINDER_1H';
  }

  private presetOffsetMin(key: ReminderPresetKey): number | null {
    switch (key) {
      case 'AT_START': return 0;
      case 'MIN_5':    return 5;
      case 'MIN_15':   return 15;
      case 'HOUR_1':   return 60;
      case 'HOUR_2':   return 120;
      case 'DAY_1':    return 60 * 24;
      default:         return null;
    }
  }

  /** Mappa offset minuti → preset key (per ripristinare la UI dal subdoc). */
  private inferPresetFromOffset(offsetMin: number): ReminderPresetKey {
    if (offsetMin === 0)    return 'AT_START';
    if (offsetMin === 5)    return 'MIN_5';
    if (offsetMin === 15)   return 'MIN_15';
    if (offsetMin === 60)   return 'HOUR_1';
    if (offsetMin === 120)  return 'HOUR_2';
    if (offsetMin === 1440) return 'DAY_1';
    return 'CUSTOM';
  }

  /** Avvia il listener sul sub-doc eventReminders/{myUid} per un evento.
   *  Sostituisce il vecchio modello `note.reminderTime` top-level: ogni utente
   *  vede e modifica solo i propri reminder. Migra i legacy reminderTime al
   *  primo open dell'owner. */
  private startEventReminderWatcher(eventId: string): void {
    this.stopEventReminderWatcher();
    this.eventReminderFirstEmit = true;
    this.myEventReminderUnsub = this.noteService.watchMyEventReminder(eventId, (offsetMin) => {
      const isOwner = this.note.myRole !== 'guest';
      // Migrazione lazy owner-side: se il sub-doc non esiste e c'è un legacy
      // `reminderTime` salvato sul doc evento, ricostruisci l'offset e scrivilo
      // nel sub-doc. Lo svuotamento del campo legacy avviene al prossimo save.
      if (this.eventReminderFirstEmit) {
        this.eventReminderFirstEmit = false;
        if (offsetMin === null && isOwner && typeof this.note.reminderTime === 'number'
            && typeof this.note.eventStart === 'number') {
          const legacyOffset = Math.round((this.note.eventStart - this.note.reminderTime) / 60_000);
          if (legacyOffset >= 0 && legacyOffset <= 60 * 24 * 30) {
            console.log('[eventReminders] migration owner: offset=', legacyOffset);
            this.noteService.writeMyEventReminder(eventId, legacyOffset).catch(err =>
              console.warn('[eventReminders] migration write failed', err));
            // Non aggiornare la UI ora: il watcher riemetterà col valore migrato.
            return;
          }
        }
      }
      // Applica lo stato del sub-doc (o il default vuoto per il guest).
      if (offsetMin === null) {
        this.reminderEnabled = false;
        this.reminderPresetKey = 'HOUR_1';
        this.note.reminderTime = null;
      } else {
        this.reminderEnabled = true;
        this.reminderPresetKey = this.inferPresetFromOffset(offsetMin);
        if (typeof this.note.eventStart === 'number') {
          this.note.reminderTime = this.note.eventStart - offsetMin * 60_000;
        }
      }
      this.cdr.markForCheck();
    });
  }

  private stopEventReminderWatcher(): void {
    if (this.myEventReminderUnsub) { this.myEventReminderUnsub(); this.myEventReminderUnsub = null; }
  }

  /** Inferisce il reminderPresetKey dalla differenza eventStart−reminderTime.
   *  Usato in initNote() per ripristinare la selezione preset al riaprire la nota. */
  private inferReminderPresetKey(eventStart?: number, reminderTime?: number | null): ReminderPresetKey {
    if (!eventStart || typeof reminderTime !== 'number') return 'HOUR_1';
    const offsetMin = Math.round((eventStart - reminderTime) / 60_000);
    if (offsetMin === 0)    return 'AT_START';
    if (offsetMin === 5)    return 'MIN_5';
    if (offsetMin === 15)   return 'MIN_15';
    if (offsetMin === 60)   return 'HOUR_1';
    if (offsetMin === 120)  return 'HOUR_2';
    if (offsetMin === 1440) return 'DAY_1';
    return 'CUSTOM';
  }

  // Cache dei Date ricostruiti dal timestamp: il getter NON deve ricreare
  // l'oggetto Date ad ogni CD (Angular vede nuovo reference su [value] →
  // re-emit di valueChange → loop infinito di CD → freeze app).
  private _eventStartDateCache: Date | null = null;
  private _eventStartTsCache: number | null = null;
  private _eventEndDateCache: Date | null = null;
  private _eventEndTsCache: number | null = null;

  get eventStartAsDate(): Date | null {
    const ts = this.note.eventStart;
    if (typeof ts !== 'number') { this._eventStartDateCache = null; this._eventStartTsCache = null; return null; }
    if (this._eventStartTsCache !== ts) {
      this._eventStartDateCache = new Date(ts);
      this._eventStartTsCache = ts;
    }
    return this._eventStartDateCache;
  }

  get eventEndAsDate(): Date | null {
    const ts = this.note.eventEnd;
    if (typeof ts !== 'number') { this._eventEndDateCache = null; this._eventEndTsCache = null; return null; }
    if (this._eventEndTsCache !== ts) {
      this._eventEndDateCache = new Date(ts);
      this._eventEndTsCache = ts;
    }
    return this._eventEndDateCache;
  }

  onEventStartChange(date: Date | null): void {
    if (!date) return;
    this.note.eventStart = date.getTime();
    // Se eventEnd esiste e ora è < eventStart, aggiusta forward
    if (typeof this.note.eventEnd === 'number' && this.note.eventEnd < date.getTime()) {
      this.note.eventEnd = date.getTime() + 60 * 60 * 1000;
    }
    // Ricalcola reminderTime se abilitato (NONE e CUSTOM non hanno offset fisso)
    if (this.reminderEnabled) {
      const offsetMin = this.presetOffsetMin(this.reminderPresetKey);
      if (typeof offsetMin === 'number') {
        this.note.reminderTime = date.getTime() - offsetMin * 60_000;
      }
    }
    this.triggerAutoSave();
  }

  onEventEndChange(date: Date | null): void {
    if (!date) return;
    this.note.eventEnd = date.getTime();
    this.triggerAutoSave();
  }

  // ── Nuovo layout inline event: picker opener + date/time change handlers ──

  /** True se eventEnd cade nello stesso giorno di eventStart (confronto locale). */
  get isEndSameDayAsStart(): boolean {
    if (!this.note?.eventStart || !this.note?.eventEnd) return false;
    const s = new Date(this.note.eventStart);
    const e = new Date(this.note.eventEnd);
    return s.getFullYear() === e.getFullYear()
      && s.getMonth() === e.getMonth()
      && s.getDate() === e.getDate();
  }

  /** Apre il MatDatepicker nascosto per event start. */
  openEventStartPicker(): void {
    this.eventStartDp?.open();
  }

  /** Apre il MatDatepicker nascosto per event end. */
  openEventEndPicker(): void {
    this.eventEndDp?.open();
  }

  /** Gestisce il cambio data dal datepicker nascosto di event start.
   *  Preserva l'ora corrente del timestamp eventStart. */
  onEventStartDateChange(date: Date | null): void {
    if (!date) return;
    const existing = this.note.eventStart ? new Date(this.note.eventStart) : new Date();
    date.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
    this.onEventStartChange(date);
  }

  /** Gestisce il cambio data dal datepicker nascosto di event end.
   *  Preserva l'ora corrente del timestamp eventEnd. */
  onEventEndDateChange(date: Date | null): void {
    if (!date) return;
    const existing = this.note.eventEnd ? new Date(this.note.eventEnd) : new Date();
    date.setHours(existing.getHours(), existing.getMinutes(), 0, 0);
    this.onEventEndChange(date);
  }

  /** Gestisce il cambio ora dall'input time nascosto di event start. */
  onEventStartTimeChange(timeStr: string): void {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':').map(Number);
    const base = this.note.eventStart ? new Date(this.note.eventStart) : new Date();
    base.setHours(h, m, 0, 0);
    this.onEventStartChange(base);
  }

  /** Gestisce il cambio ora dall'input time nascosto di event end. */
  onEventEndTimeChange(timeStr: string): void {
    if (!timeStr) return;
    const [h, m] = timeStr.split(':').map(Number);
    const base = this.note.eventEnd ? new Date(this.note.eventEnd) : new Date();
    base.setHours(h, m, 0, 0);
    this.onEventEndChange(base);
  }

  enableDuration(): void {
    console.log('[DBG-EVT-EDITOR] enable duration');
    // Default: end = start (stessa data e ora). L'utente regola manualmente.
    this.note.eventEnd = this.note.eventStart ?? Date.now();
    this.triggerAutoSave();
  }

  removeDuration(e: Event): void {
    e.stopPropagation();
    console.log('[DBG-EVT-EDITOR] remove duration');
    this.note.eventEnd = undefined;
    this.triggerAutoSave();
  }

  async openReminderPresetSheet(): Promise<void> {
    const eventStart = this.note.eventStart;
    if (!eventStart) return;
    const current: ReminderPresetKey = this.reminderEnabled ? this.reminderPresetKey : 'NONE';
    const data: ReminderPresetSheetData = { eventStart, current };
    console.log('[DBG-EVT-RPS] opening with panelClass: reminder-preset-sheet-pane');
    const ref = this.bottomSheet.open(ReminderPresetSheetComponent, {
      data,
      panelClass: 'reminder-preset-sheet-pane',
    });
    const result: ReminderPresetSheetResult | undefined = await firstValueFrom(ref.afterDismissed());
    if (!result) return;
    console.log('[DBG-EVT-EDITOR] preset selected', { key: result.key, time: result.time });

    // Calcola l'offset target dal preset (NONE = null = disable).
    let nextOffsetMin: number | null;
    if (result.key === 'NONE') {
      nextOffsetMin = null;
    } else if (result.key === 'CUSTOM') {
      // Apre il dialog "Personalizza": l'utente sceglie data/ora esatta del
      // reminder; calcoliamo offsetMin = (eventStart - selected) / 60000.
      const ref = this.dialog.open<EventReminderCustomDialogComponent, EventReminderCustomDialogData, EventReminderCustomDialogResult | null>(
        EventReminderCustomDialogComponent,
        { data: { eventStart }, width: '420px', maxWidth: '95vw' }
      );
      const customResult = await firstValueFrom(ref.afterClosed());
      if (!customResult) return;
      nextOffsetMin = customResult.offsetMin;
      this.reminderPresetKey = 'CUSTOM';
    } else {
      const offset = this.presetOffsetMin(result.key);
      if (typeof offset !== 'number') return;
      nextOffsetMin = offset;
    }

    // Aggiorna stato UI immediato (il watcher confermerà o sovrascriverà).
    if (nextOffsetMin === null) {
      this.reminderEnabled = false;
      this.note.reminderTime = null;
    } else {
      this.reminderEnabled = true;
      this.reminderPresetKey = result.key;
      this.note.reminderTime = eventStart - nextOffsetMin * 60_000;
    }

    // Persisti sul sub-doc per-utente. Per nuovi eventi non ancora salvati,
    // bufferizza in pendingReminderOffsetMin: il flush avviene dopo createNote.
    if (this.savedNoteId) {
      this.noteService.writeMyEventReminder(this.savedNoteId, nextOffsetMin).catch(err => {
        console.warn('[eventReminders] write failed', err);
      });
    } else {
      this.pendingReminderOffsetMin = nextOffsetMin;
    }
  }

  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  private cryptoService = inject(CryptoService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private overdueTicker: ReturnType<typeof setInterval> | null = null;
  private dialog = inject(MatDialog);
  private bottomSheet = inject(MatBottomSheet);
  translationService = inject(TranslationService);
  private toast = inject(ToastService);

  /** Set to true whenever the blocks array changes and text blocks need HTML re-init. */
  private textBlocksNeedInit = false;
  private myUsername: string | null = null;
  /** Set to true when markReminderCompleted fires on a shared note — buildPayload emits flags. */
  private completionNotifyPendingFlag = false;
  /** True while own performAutoSave is in-flight — prevents Firestore's local pending-write
   *  snapshot from triggering applyRemoteUpdate before lastSavedAt is updated. */
  private pendingOwnWrite = false;
  /** Block index to focus after next DOM init (used to open keyboard on new text block). */
  private pendingFocusBlockIndex: number | null = null;
  private pendingFocusChecklistBlockIndex: number | null = null;
  /** When true, onTextFocus() skips signal updates to avoid interrupting iOS keyboard gesture chain. */
  private _skipTextFocusSignals = false;
  /** Set to true when a new note is created — focuses the title input after DOM init. */
  private pendingFocusTitleInput = false;

  private get PLACEHOLDER_TITLE(): string { return this.translationService.instant('NOTE.UNTITLED'); }
  get dateLocale(): string { return this.translationService.pipeDateLocale; }
  private savedNoteId: string | null = null;
  private isNewNote = false;
  private autoSaveTimer: any = null;
  private createNotePromise: Promise<void> | null = null;
  private imageProcessor = inject(ImageProcessorService);
  /** Indice del block image attualmente in upload (null se nessuno). */
  readonly imageBlockUploading = signal<number | null>(null);
  private imageBlockErrors = new Map<number, string>();
  private liveNoteUnsub: (() => void) | null = null;
  /** Watcher subdoc eventReminders/{myUid} per type=event. */
  private myEventReminderUnsub: (() => void) | null = null;
  /** Buffer offset preset per nuovi eventi non ancora salvati: persiste dopo createNote. */
  private pendingReminderOffsetMin: number | null | undefined = undefined;
  /** True dopo il primo emit del watcher: serve per la migrazione lazy owner-side. */
  private eventReminderFirstEmit = true;
  private livePermsUnsub: (() => void) | null = null;
  private lastSavedAt = 0;
  private userHasModifiedContent = false;

  // ─── Presence ─────────────────────────────────────────────────────────────
  readonly presenceUsers = signal<PresenceEntry[]>([]);
  readonly syncState = signal<'idle' | 'syncing' | 'synced'>('idle');
  private syncStateTimer: any = null;
  private presenceUnsub: (() => void) | null = null;
  private presenceHeartbeat: any = null;
  private editingTimeout: any = null;
  private presenceEditing = false;
  private selfDisplayName: string | null = null;

  // ─── Sottoscrizione reminder per-user (Fase 1) ────────────────────────────
  readonly snoozedUntil = signal<number | null>(null);
  readonly reminderMuted = signal<boolean>(false);
  readonly showSnoozeSheet = signal(false);
  snoozeConfirmPending = false; // true dopo primo tap su "Annulla snooze" (confirm-on-second-tap)
  private snoozeUnsub: (() => void) | null = null;

  get reminderSubState(): { muted: boolean; snoozedUntil: number | null } {
    return { muted: this.reminderMuted(), snoozedUntil: this.snoozedUntil() };
  }

  /** Stato snooze o mute attivo. Usato per l'icona campanella. */
  get hasActiveSuppression(): boolean {
    if (this.reminderMuted()) return true;
    const until = this.snoozedUntil();
    return !!until && until > Date.now();
  }
  private prevCompletedBy: string | null = null;
  /** Cache uid→username per evitare fetch ripetuti nel completion toast. */
  private readonly usernameCache = new Map<string, string>();

  // ─── Memo header: inline toast per evasione ricorrenza ───────────────────
  /** Messaggio del micro-toast inline (null = nascosto). */
  readonly memoInlineToast = signal<string | null>(null);
  private memoInlineToastTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Inferisce la ReminderPresetKey dal campo `notifyOffsetMin` del ReminderBlock.
   * Usato per derivare la label della bell-pill senza signal interno.
   */
  private inferMemoPresetKey(offsetMin: number | undefined): ReminderPresetKey {
    switch (offsetMin) {
      case 0:
      case undefined: return 'AT_START';
      case 5:         return 'MIN_5';
      case 15:        return 'MIN_15';
      case 60:        return 'HOUR_1';
      case 120:       return 'HOUR_2';
      case 1440:      return 'DAY_1';
      default:        return 'CUSTOM';
    }
  }

  /**
   * Label i18n della bell-pill memo. Derivata da `block.notifyOffsetMin` anziché da
   * un signal interno — così resta sempre in sync con il documento senza stato locale.
   */
  get memoReminderPresetLabel(): string {
    const rb = this.reminderBlock;
    const offset = (rb as any)?.notifyOffsetMin as number | undefined;
    const key = this.inferMemoPresetKey(offset);
    const map: Record<ReminderPresetKey, string> = {
      NONE:     'EVENT.REMINDER_NONE',
      AT_START: 'MEMO.REMINDER_AT_TIME',
      MIN_5:    'EVENT.REMINDER_5MIN',
      MIN_15:   'EVENT.REMINDER_15MIN',
      HOUR_1:   'EVENT.REMINDER_1H',
      HOUR_2:   'EVENT.REMINDER_2H',
      DAY_1:    'EVENT.REMINDER_1DAY',
      CUSTOM:   'MEMO.REMINDER_CUSTOM_LABEL',
    };
    return map[key] ?? 'MEMO.REMINDER_AT_TIME';
  }

  /**
   * Timestamp effettivo di notifica mostrato nella sub-label della bell-pill.
   * notifyTime = block.time - notifyOffsetMin * 60000.
   * Retrocompat: se notifyOffsetMin è assente, coincide con block.time.
   */
  get memoNotifyTime(): number | null {
    const rb = this.reminderBlock;
    if (!rb || !rb.time) return null;
    const offset = (rb as any).notifyOffsetMin as number | undefined;
    return rb.time - (offset ?? 0) * 60_000;
  }

  /** Apre la bell-pill bottom-sheet in modalità memo: tutti i preset (no NONE). */
  /**
   * Resetta lo stato di consegna del reminder in modo che il server lo
   * rinotifichi. Chiamato ogni volta che si cambia offset o ricorrenza —
   * qualsiasi modifica che altera il momento effettivo della notifica.
   */
  private resetReminderForRedeliver(rb: any): void {
    rb.status = 'pending';
    rb._evaded = false;
    rb._prevTime = null;
  }

  async openMemoReminderPill(): Promise<void> {
    const rb = this.reminderBlock;
    if (!rb || !rb.time) return;
    const anchor = rb.time as number;
    const prevOffset: number = (rb as any).notifyOffsetMin ?? 0;
    const currentKey = this.inferMemoPresetKey(prevOffset);
    const data: ReminderPresetSheetData = {
      eventStart: anchor,
      current: currentKey,
      mode: 'memo',
    };
    const ref = this.bottomSheet.open(ReminderPresetSheetComponent, {
      data,
      panelClass: 'reminder-preset-sheet-pane',
    });
    const result: ReminderPresetSheetResult | undefined = await firstValueFrom(ref.afterDismissed());
    if (!result) return;

    // Mappa result.key → notifyOffsetMin e persisti sul block.
    // block.time NON viene mai modificato qui: rappresenta l'orario logico del promemoria.
    const offsetMap: Partial<Record<ReminderPresetKey, number>> = {
      AT_START: 0,
      MIN_5:    5,
      MIN_15:   15,
      HOUR_1:   60,
      HOUR_2:   120,
      DAY_1:    1440,
    };

    if (result.key === 'CUSTOM' && result.time != null) {
      // L'utente ha scelto un datetime assoluto (sempre < block.time, validato nel sheet).
      // Calcola l'offset come delta in minuti.
      const computed = Math.round((anchor - result.time) / 60_000);
      (rb as any).notifyOffsetMin = computed > 0 ? computed : 0;
    } else if (result.key in offsetMap) {
      (rb as any).notifyOffsetMin = offsetMap[result.key as keyof typeof offsetMap];
    }
    // Nessun branch NONE: il bottom-sheet in memo mode non espone NONE.
    // Il toggle Mute (già implementato) gestisce "nessuna notifica".

    // Resetta lo stato di consegna SOLO se l'offset è effettivamente cambiato,
    // evitando reset spuri quando l'utente apre il sheet e conferma lo stesso valore.
    const newOffset: number = (rb as any).notifyOffsetMin ?? 0;
    if (newOffset !== prevOffset) {
      this.resetReminderForRedeliver(rb as any);
    }
    this.triggerAutoSave();
  }

  /** Cambia ricorrenza del memo. Azzeramento a 'none' rimuove anche recurrenceEndDate. */
  setMemoRecurrence(recurrence: string): void {
    const rb = this.reminderBlock;
    if (!rb) return;
    rb.recurrence = recurrence;
    if (recurrence === 'none') {
      rb.recurrenceEndDate = null;
      rb._endDate = null;
    }
    this.onReminderChange();
  }

  /** Label leggibile della ricorrenza corrente del memo. */
  get memoRecurrenceLabel(): string {
    const rb = this.reminderBlock;
    if (!rb || rb.recurrence === 'none') return '';
    const map: Record<string, string> = {
      daily:   'EDITOR.RECURRENCE.DAILY',
      weekly:  'EDITOR.RECURRENCE.WEEKLY',
      monthly: 'EDITOR.RECURRENCE.MONTHLY',
      yearly:  'EDITOR.RECURRENCE.YEARLY',
    };
    return map[rb.recurrence] ?? '';
  }

  /**
   * Mostra un micro-toast inline per 6s con l'opzione undo dopo evasione ricorrente.
   * Sostituisce markReminderCompleted per il memo header: chiama il parent e poi
   * visualizza il toast. Il toast sparisce al timeout o se l'utente clicca undo.
   */
  markMemoRecurringEvaded(block: any): void {
    // Salva il timestamp corrente per il toast label prima di avanzare
    const currentTime: number = block.date
      ? (() => { const d = new Date(block.date); d.setHours(parseInt(block.hour ?? '12', 10), parseInt(block.minute ?? '00', 10), 0, 0); return d.getTime(); })()
      : (block.time as number ?? Date.now());
    const dateLabel = new Date(currentTime).toLocaleDateString(this.translationService.locale, { day: 'numeric', month: 'short' });

    this.markReminderCompleted(block, this.isOverdueRecurring(block));

    // Mostra toast inline
    if (this.memoInlineToastTimer) clearTimeout(this.memoInlineToastTimer);
    this.memoInlineToast.set(dateLabel);
    this.memoInlineToastTimer = setTimeout(() => {
      this.memoInlineToast.set(null);
      this.memoInlineToastTimer = null;
      block._evaded = false;
      block._prevTime = null;
    }, 6000);
  }

  undoMemoEvasionInline(block: any): void {
    if (this.memoInlineToastTimer) clearTimeout(this.memoInlineToastTimer);
    this.memoInlineToast.set(null);
    this.memoInlineToastTimer = null;
    this.undoRecurringEvasion(block);
  }

  get hasReminderBlock(): boolean {
    return this.note.blocks.some(b => b.type === 'reminder');
  }

  /** Mostra la calendar pill: interattiva per owner con ≥2 calendari, read-only per guest. */
  get showCalendarPicker(): boolean {
    return this.note?.type === 'event' && (this.ownedCalendars.length > 1 || this.isReadOnlyEvent);
  }

  /**
   * True se il calendario dell'evento non appartiene all'utente corrente.
   * Forward-compat per eventi di calendari subscribed: picker disabled.
   */
  get isReadOnlyEvent(): boolean {
    if (this.note?.type !== 'event') return false;
    if (!this.note.calendarId) return false;
    return !this.ownedCalendars.some(c => c.id === this.note.calendarId);
  }

  onCalendarPickerChange(newCalId: string): void {
    this.note.calendarId = newCalId;
    this.triggerAutoSave();
  }

  /** Colore del calendario attualmente selezionato per il dot del mini-FAB. */
  get selectedCalendarColor(): string {
    if (!this.note?.calendarId) return '#1C1B1F';
    const cal = this.allCalendars.find(c => c.id === this.note.calendarId)
             ?? this.ownedCalendars.find(c => c.id === this.note.calendarId);
    return cal?.color || '#1C1B1F';
  }

  get selectedCalendarTitle(): string {
    if (!this.note?.calendarId) return '';
    const cal = this.allCalendars.find(c => c.id === this.note.calendarId)
             ?? this.ownedCalendars.find(c => c.id === this.note.calendarId);
    return cal?.title || '';
  }

  async openCalendarPickerSheet(): Promise<void> {
    if (this.note?.type !== 'event') return;
    const ref = this.bottomSheet.open(CalendarPickerSheetComponent, {
      panelClass: 'reminder-preset-sheet-pane',
      data: { calendars: this.ownedCalendars, currentId: this.note.calendarId ?? null } satisfies CalendarPickerSheetData,
    });
    const result: CalendarPickerSheetResult | undefined = await firstValueFrom(ref.afterDismissed());
    if (result?.calendarId && result.calendarId !== this.note.calendarId) {
      this.note.calendarId = result.calendarId;
      this.triggerAutoSave();
    }
  }

  get anyCollaboratorEditing(): boolean {
    return this.presenceUsers().some(u => u.isEditing);
  }

  get hasViewingCollaborators(): boolean {
    return this.presenceUsers().length > 0 && !this.anyCollaboratorEditing;
  }

  /** True se un collaboratore ha effettuato una qualsiasi mutazione negli ultimi 5s. */
  get hasRecentCollabActivity(): boolean {
    const threshold = Date.now() - 5_000;
    return this.presenceUsers().some(u => (u.lastActivityAt ?? 0) > threshold);
  }

  /** True se l'utente corrente ha snoozato il reminder e il tempo non è ancora scaduto. */
  get isSnoozed(): boolean {
    const until = this.snoozedUntil();
    return !!until && until > Date.now();
  }

  /** Etichetta formattata dello snooze attivo (es. "fino alle 10:00", "fino a domani"). */
  get snoozeLabel(): string {
    const until = this.snoozedUntil();
    if (!until) return '';
    const now = new Date();
    const target = new Date(until);
    const isToday = target.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = target.toDateString() === tomorrow.toDateString();
    const hhmm = target.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `${this.translationService.instant('EDITOR.SNOOZE_UNTIL')} ${hhmm}`;
    if (isTomorrow) return `${this.translationService.instant('EDITOR.SNOOZE_UNTIL_TOMORROW')} ${hhmm}`;
    const dateStr = target.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    return `${this.translationService.instant('EDITOR.SNOOZE_UNTIL_DATE')} ${dateStr} ${hhmm}`;
  }

  get reminderBlock(): any | null {
    return this.note.blocks.find(b => b.type === 'reminder') ?? null;
  }

  /** True se la nota è salvata — il pannello sharing è disponibile sia per owner che per guest. */
  get canShare(): boolean {
    return !!this.savedNoteId;
  }

  /** True se l'utente è guest su questa nota. */
  get isGuest(): boolean {
    return this.note.myRole === 'guest';
  }

  /** True se il guest può modificare il contenuto (editContent). */
  get guestCanEdit(): boolean {
    return !this.isGuest || !!(this.note.myPermissions?.editContent);
  }

  /** True se il guest può modificare i reminder (editReminders). */
  get guestCanEditReminders(): boolean {
    return !this.isGuest || !!(this.note.myPermissions?.editReminders);
  }

  /** True se l'utente può spuntare/de-spuntare checklist (ma non modificare il testo).
   *  Permesso più ampio di guestCanEdit: vale per tutti i collaboratori diretti della nota,
   *  ma NON per i subscriber del calendario (isReadOnlyEvent). */
  get guestCanToggleChecklist(): boolean {
    return !this.isReadOnlyEvent;
  }

  // ─── Sharing ────────────────────────────────────────────────────────────────

  async openSharePanel() {
    if (!this.savedNoteId) return;

    // Il nuovo flusso share-by-code usa E2EE AES per-nota:
    // la nota viene ricifrata con AES (non in plaintext) al momento della generazione
    // del codice di condivisione. Nessun warning necessario.

    const ref = this.dialog.open(SharingPanelComponent, {
      data: {
        noteId: this.savedNoteId,
        myRole: this.note.myRole,
        ownerUid: this.note.uid,
        docType: this.note.type,
      },
      width: '480px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((result) => {
      if (result?.left) {
        this.stopLiveSync();
        this.closeEditor.emit(this.note ?? null);
      }
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() {
    this.initNote();
    this.noteService.getUsername().then(u => this.myUsername = u).catch(() => {});
    // Ticker per re-evaluare stato overdue: se l'editor è aperto quando passa
    // l'orario del reminder, isOverdueRecurring/isSingleOverdue sono valutati
    // in CD. CD non parte da solo a tempo: ogni 30s forziamo il check.
    this.overdueTicker = setInterval(() => this.cdr.markForCheck(), 30000);
    this.installKeyboardDetector();
  }

  /** Rileva apertura/chiusura della tastiera virtuale.
   *  Strategia primaria: focus/blur su campi text (input/textarea/contenteditable).
   *  Affidabile in PWA iOS dove visualViewport heuristic non scatta perché
   *  innerHeight si riduce parimenti con la tastiera.
   *  Fallback: visualViewport con baseline = max storico di innerHeight,
   *  utile quando la tastiera viene chiusa via gesto (focus rimane sull'input).  */
  private installKeyboardDetector(): void {
    if (typeof window === 'undefined') return;

    const isTextInput = (el: Element | null): boolean => {
      if (!el) return false;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT') {
        const type = (el as HTMLInputElement).type;
        return ['text', 'search', 'email', 'url', 'tel', 'password', 'number', ''].includes(type);
      }
      return (el as HTMLElement).isContentEditable === true;
    };

    const updateFromFocus = () => {
      const open = isTextInput(document.activeElement);
      if (open !== this.keyboardOpen()) {
        this.keyboardOpen.set(open);
        this.cdr.markForCheck();
      }
    };

    const onFocusIn = () => updateFromFocus();
    const onFocusOut = () => setTimeout(updateFromFocus, 50);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);

    let baseHeight = window.innerHeight;
    const onVvResize = () => {
      if (window.innerHeight > baseHeight) baseHeight = window.innerHeight;
      // Se vv.height è quasi pari alla baseline, tastiera certamente chiusa:
      // forza false (caso "focus rimasto ma tastiera dismessa via gesto").
      if (window.visualViewport && window.visualViewport.height >= baseHeight * 0.95) {
        if (this.keyboardOpen()) {
          this.keyboardOpen.set(false);
          this.cdr.markForCheck();
        }
      } else {
        updateFromFocus();
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onVvResize);
    }

    this.vvResizeListener = () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', onVvResize);
      }
    };
    updateFromFocus();
  }
  ngOnChanges(changes: SimpleChanges) { if (changes['selectedNote']) this.initNote(); }
  ngDoCheck() { if (!this.guestCanEdit && this.addBlockMenuOpen()) this.addBlockMenuOpen.set(false); }

  ngAfterViewInit() {
    // Focus sul titolo alla prima render di una nuova nota.
    // ngAfterViewInit è chiamato sincronicamente nella stessa catena del gesture utente
    // (zone.js triggera CD in modo sincrono alla fine dell'event handler) →
    // .focus() senza setTimeout apre la tastiera iOS.
    if (this.pendingFocusTitleInput) {
      this.pendingFocusTitleInput = false;
      this.titleInputRef?.nativeElement?.focus();
    }
  }

  ngAfterViewChecked() {
    if (this.textBlocksNeedInit) {
      this.textBlocksNeedInit = false;
      this.initTextBlockElements();
      this.applyPendingFocus();
    }
    if (this.pendingFocusChecklistBlockIndex !== null) {
      this.applyPendingChecklistFocus();
    }
  }

  /** Foca il primo input checklist del blocco appena creato.
   *  I blocchi reminder non hanno un .block-item DOM (sono renderizzati a parte),
   *  quindi mappiamo l'indice della collezione note.blocks all'indice DOM
   *  contando solo i blocchi non-reminder. */
  private applyPendingChecklistFocus(): void {
    const targetIdx = this.pendingFocusChecklistBlockIndex;
    if (targetIdx === null) return;
    let domIdx = 0;
    for (let i = 0; i < targetIdx; i++) {
      if (this.note.blocks[i].type !== 'reminder') domIdx++;
    }
    const root = this.editorContent?.nativeElement;
    if (!root) return;
    const blockEls = root.querySelectorAll<HTMLElement>('.block-item');
    const blockEl = blockEls[domIdx];
    const input = blockEl?.querySelector<HTMLInputElement>('.checklist-input');
    if (!input) return;
    this.pendingFocusChecklistBlockIndex = null;
    // focus() prima di activeBlockIndex.set(): su iOS il re-render di ⋮/+
    // scatenato dal signal può interrompere il focus e bloccare l'apertura
    // della tastiera virtuale. Il blocco diventa "attivo" dopo il focus.
    input.focus();
    this.activeBlockIndex.set(targetIdx);
    // block: 'nearest' scrolla solo il minimo per rendere visibile l'input,
    // evitando di posizionarlo al centro della viewport intera (che con la
    // tastiera aperta corrisponde a troppo in alto).
    input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private applyPendingFocus() {
    if (this.pendingFocusBlockIndex === null) return;
    const targetIdx = this.pendingFocusBlockIndex;
    this.pendingFocusBlockIndex = null;
    // Conta quanti blocchi testo precedono targetIdx per trovare l'elemento corretto
    let textElIdx = 0;
    for (let i = 0; i < targetIdx; i++) {
      if (this.note.blocks[i].type === 'text') textElIdx++;
    }
    const el = this.textBlockEls.toArray()[textElIdx]?.nativeElement;
    if (!el) return;
    // Stessa tecnica di applyPendingChecklistFocus: sopprimiamo gli aggiornamenti
    // segnale durante el.focus() per non innescare un re-render che interrompe
    // la catena gesture-iOS e blocca l'apertura della tastiera virtuale.
    this._skipTextFocusSignals = true;
    el.focus();
    this._skipTextFocusSignals = false;
    this.activeTextBlockIndex.set(targetIdx);
    this.activeBlockIndex.set(targetIdx);
    this.updateFormatState();
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  private initTextBlockElements() {
    const els = this.textBlockEls.toArray();
    const focusedTextIdx = this.activeTextBlockIndex();
    let textIdx = 0;
    this.note.blocks.forEach(block => {
      if (block.type === 'text') {
        // Skip the focused block: setting innerHTML would drop cursor/selection
        if (els[textIdx] && textIdx !== focusedTextIdx) {
          els[textIdx].nativeElement.innerHTML = (block as TextBlock).html || '';
        }
        textIdx++;
      }
    });
  }

  /** Error corrente per l'image block a `idx` (i18n key). Letto dal template. */
  imageBlockError(idx: number): string | null {
    return this.imageBlockErrors.get(idx) ?? null;
  }

  /** True se la nota ha già un ImageBlock (limite: una immagine per nota). */
  get hasImageBlock(): boolean {
    return this.note.blocks.some(b => b.type === 'image');
  }

  /** Conteggio blocchi effettivamente draggabili (esclude reminder virtuale). */
  get draggableBlockCount(): number {
    return this.note.blocks.filter(b => b.type !== 'reminder').length;
  }

  /**
   * Handler input file per image-block: comprime via ImageProcessorService,
   * assegna data+mimeType al block e triggera autosave.
   */
  async onImageBlockFileSelected(blockIndex: number, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permette re-selezione dello stesso file
    if (!file) return;
    const block = this.note.blocks[blockIndex] as ImageBlock;
    if (!block || block.type !== 'image') return;

    this.imageBlockErrors.delete(blockIndex);
    this.imageBlockUploading.set(blockIndex);
    try {
      const out = await this.imageProcessor.compressImage(file);
      block.data = out.data;
      block.mimeType = out.mimeType as any;
      this.userHasModifiedContent = true;
      this.triggerAutoSave();
    } catch (err: any) {
      const code = (err?.message as string) ?? 'UNSUPPORTED_FORMAT';
      const key = code === 'TOO_LARGE' ? 'IMAGE.TOO_LARGE'
                : code === 'HEIC_UNSUPPORTED' ? 'IMAGE.HEIC_UNSUPPORTED'
                : 'IMAGE.UNSUPPORTED_FORMAT';
      this.imageBlockErrors.set(blockIndex, key);
    } finally {
      this.imageBlockUploading.set(null);
      this.cdr.detectChanges();
    }
  }

  private initNote() {
    this.imageBlockErrors.clear();
    this.imageBlockUploading.set(null);
    if (this.selectedNote) {
      // Se stiamo già editando questa stessa nota, non re-inizializzare (preserva le modifiche non ancora salvate)
      if (this.selectedNote.id && this.selectedNote.id === this.savedNoteId) {
        // Ma controlla se lo stato di sharing è cambiato (es. collaboratore appena aggiunto)
        // e avvia il live sync se non è ancora attivo
        const nowShared = !!(this.selectedNote.isShared || this.selectedNote.myRole === 'guest');
        if (nowShared && !this.liveNoteUnsub) {
          this.note = {
            ...this.note,
            isShared: this.selectedNote.isShared,
            myRole: this.selectedNote.myRole,
            myPermissions: this.selectedNote.myPermissions,
          };
          this.startLiveSync();
        }
        return;
      }
      // Se stavamo creando una nuova nota pristine, eliminala prima di aprire quella selezionata
      if (this.isNewNote && this.isPristine()) {
        const prevId = this.savedNoteId;
        const prevPromise = this.createNotePromise;
        if (prevId) {
          (async () => {
            if (prevPromise) await prevPromise.catch(() => {});
            this.noteService.deleteNote(prevId).catch(() => {});
          })();
        }
      }
      this.savedNoteId = this.selectedNote.id || null;
      this.isNewNote = false;
      this.userHasModifiedContent = false;
      this.createNotePromise = null;
      const blocks = migrateToBlocks(this.selectedNote);
      // Attach runtime UI state to each block
      blocks.forEach(block => {
        if (block.type === 'location') {
          const lb = block as any;
          lb.searchQuery = lb.searchQuery || '';
          lb.addressOptions = [];
          lb.editing = !lb.address;
          if (lb.lat && lb.lon) lb.mapUrl = this.generateMapUrl(lb.lat, lb.lon);
        }
        if (block.type === 'reminder') {
          const rb = block as any;
          if (rb.time) {
            const d = new Date(rb.time);
            rb.date = d;
            rb.hour = d.getHours().toString().padStart(2, '0');
            rb.minute = d.getMinutes().toString().padStart(2, '0');
          } else {
            const now = new Date();
            rb.date = now;
            rb.hour = now.getHours().toString().padStart(2, '0');
            rb.minute = now.getMinutes().toString().padStart(2, '0');
          }
          // Ripristina campi runtime da Firestore
          rb._evaded = rb.evaded ?? false;
          rb._wasOverdue = rb.wasOverdue ?? false;
          rb._endDate = rb.recurrenceEndDate ? new Date(rb.recurrenceEndDate) : null;
          this.checkStalledEvasion(rb);
        }
      });
      this.note = {
        ...this.selectedNote,
        blocks,
        tags: this.selectedNote.tags ? [...this.selectedNote.tags] : []
      };
      // Ripristina stato reminder evento (Slice H)
      // Per type=event: il reminder vive nel sub-doc per-utente (eventReminders/{myUid}).
      // Lo stato iniziale è OFF: il watcher (startEventReminderWatcher) lo riempirà
      // appena arriva il primo emit dal sub-doc. Per i guest senza sub-doc → resta OFF.
      if (this.selectedNote.type === 'event') {
        this.reminderEnabled = false;
        this.reminderPresetKey = 'HOUR_1';
      } else {
        this.reminderEnabled = false;
      }
      this.lastSavedAt = this.selectedNote.updatedAt ?? 0;
      this.stopLiveSync();
      this.startLiveSync();
      this.startSnoozeWatcher();
      // Avvia watcher eventReminders solo per type=event con id già esistente.
      if (this.selectedNote.type === 'event' && this.selectedNote.id) {
        this.startEventReminderWatcher(this.selectedNote.id);
      }
    } else {
      // Guard: ngOnInit + ngOnChanges chiamano entrambi initNote() al mount — evita doppia creazione
      if (this.isNewNote) return;
      // Guard extra: se abbiamo già un savedNoteId non creare un'altra nota
      if (this.savedNoteId) return;

      this.userHasModifiedContent = false;
      // Fase 1: type esplicito dal FAB speed-dial, default 'note' per back-compat.
      // Se ha un initialReminderDate (apertura da vista Promemoria o calendario), forziamo 'memo'.
      const resolvedType: NoteType = this.initialReminderDate && this.initialNoteType === 'note'
        ? 'memo'
        : this.initialNoteType;
      // ⚠️ Ordine branch: PRIMA event (Slice H), poi initialReminderDate (memo da
      // calendario/promemoria), poi default. Senza questa precedenza, un evento
      // creato dal FAB con initialReminderDate valorizzato (newNoteCalendarDate
      // del dashboard) cadrebbe nel ramo memo e non avrebbe eventStart → la rule
      // Firestore rifiuta perché eventStart è obbligatorio per type='event'.
      if (resolvedType === 'event') {
        // Evento nuovo: eventStart = initialReminderDate (da calendario) oppure ora arrotondata
        const eventBase = this.initialReminderDate ?? (() => {
          const now = new Date();
          now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);
          return now;
        })();
        const eventStart = eventBase.getTime();
        // Includi calendarId pre-risolto dal dashboard (Personale lazy-create
        // o primo owned). Senza questo, il calendar-picker mostra come selected
        // il primo calendar della lista (non Personale) — visual mismatch col
        // payload che buildPayload fissa via initialCalendarId al save.
        this.note = {
          title: '', blocks: [], tags: [], color: 'default',
          type: resolvedType, eventStart,
          calendarId: this.initialCalendarId,
        };
        this.reminderEnabled = false;
      } else if (this.initialReminderDate) {
        // Memo da vista Promemoria o calendario: blocco reminder, nessun titolo di default
        const d = this.initialReminderDate;
        const roundedMin = Math.ceil(d.getMinutes() / 5) * 5;
        const reminderHour = roundedMin >= 60 ? d.getHours() + 1 : d.getHours();
        const reminderMin = roundedMin >= 60 ? roundedMin - 60 : roundedMin;
        const reminderBlock: any = {
          type: 'reminder', time: null, recurrence: 'none', recurrenceEndDate: null, status: null,
          date: d,
          hour: reminderHour.toString().padStart(2, '0'),
          minute: reminderMin.toString().padStart(2, '0')
        };
        this.note = { title: '', blocks: [reminderBlock], tags: [], color: 'default', type: resolvedType };
      } else {
        this.note = { title: '', blocks: [], tags: [], color: 'default', type: resolvedType };
      }
      this.isNewNote = true;
      this.pendingFocusTitleInput = true;
      this.savedNoteId = null;
      // Crea subito su Firestore per avere un ID
      const newPayload = this.buildPayload();
      this.createNotePromise = this.noteService.createNote(newPayload)
        .then(result => {
          this.savedNoteId = result.id;
          (this.note as any).id = result.id;
          this.noteCreated.emit(result.id);
          this.startSnoozeWatcher();
          // watchNote deve partire anche sulle note appena create: quando più tardi
          // il guest accetta l'invito, l'owner deve già essere iscritto per ricevere
          // gli update live senza dover riaprire la nota.
          this.startLiveSync();
          // Per type=event: flush dell'offset bufferizzato e avvio del watcher.
          if (this.note.type === 'event') {
            const pending = this.pendingReminderOffsetMin;
            this.pendingReminderOffsetMin = undefined;
            if (pending !== undefined) {
              this.noteService.writeMyEventReminder(result.id, pending).catch(err =>
                console.warn('[eventReminders] flush after createNote failed', err));
            }
            this.startEventReminderWatcher(result.id);
          }
        })
        .catch(err => console.error('[DBG-EVT-SAVE] createNote FAILED', { code: err?.code, message: err?.message, payloadType: newPayload?.type, hasEventStart: typeof newPayload?.eventStart === 'number', hasEventEnd: typeof newPayload?.eventEnd === 'number', err }));
    }
    this.textBlocksNeedInit = true;
  }

  private scrollEditorToBottom() {
    setTimeout(() => {
      const el = this.editorContent?.nativeElement;
      if (!el) return;
      // Prefer scrollIntoView on last child (più affidabile su iOS con tastiera aperta)
      const last = el.lastElementChild as HTMLElement | null;
      if (last) {
        last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    }, 100);
  }

  // ─── Block Management ───────────────────────────────────────────────────────

  addBlock(type: NoteBlock['type'], afterIndex?: number) {
    this.saveTextBlocksFromDOM();
    let newBlock: NoteBlock;
    switch (type) {
      case 'text':
        newBlock = { type: 'text', html: '' };
        break;
      case 'checklist':
        newBlock = { type: 'checklist', items: [{ text: '', done: false }] } as ChecklistBlock;
        break;
      case 'location':
        newBlock = { type: 'location', address: '', searchQuery: '', editing: true, addressOptions: [] } as any;
        break;
      case 'reminder': {
        const defaultDate = this.computeDefaultReminderDate();
        newBlock = {
          type: 'reminder', time: defaultDate.getTime(), recurrence: 'none', recurrenceEndDate: null, status: null,
          date: defaultDate,
          hour: defaultDate.getHours().toString().padStart(2, '0'),
          minute: defaultDate.getMinutes().toString().padStart(2, '0')
        } as any;
        break;
      }
      case 'image':
        newBlock = { type: 'image', data: '', mimeType: 'image/jpeg' } as ImageBlock;
        break;
      case 'link':
        newBlock = { type: 'link', url: '', label: '' } as LinkBlock;
        break;
      default:
        return;
    }
    // Se il solo blocco esistente è testo vuoto (placeholder) e si aggiunge un altro tipo, sostituiscilo
    const isOnlyEmptyText = type !== 'text' &&
      this.note.blocks.length === 1 &&
      this.note.blocks[0].type === 'text' &&
      !(this.note.blocks[0] as TextBlock).html;
    let createdAt: number;
    if (isOnlyEmptyText) {
      this.note.blocks = [newBlock];
      createdAt = 0;
    } else {
      createdAt = afterIndex !== undefined ? afterIndex + 1 : this.note.blocks.length;
      this.note.blocks = [
        ...this.note.blocks.slice(0, createdAt),
        newBlock,
        ...this.note.blocks.slice(createdAt)
      ];
      if (type === 'text') this.pendingFocusBlockIndex = createdAt;
    }
    this.textBlocksNeedInit = true;
    if (type === 'text') {
      // iOS: il focus deve avvenire nello stesso task dell'evento utente perché
      // il browser apra la tastiera virtuale. detectChanges() forza il render
      // sincrono del nuovo elemento (#textBlockEl entra nella QueryList), poi
      // applyPendingFocus() chiama el.focus() prima che zone.js chiuda il task.
      // La seconda chiamata da ngAfterViewChecked sarà no-op (pendingFocusBlockIndex = null).
      this.cdr.detectChanges();
      this.applyPendingFocus();
    }
    if (type !== 'text') this.scrollEditorToBottom();
    if (type === 'checklist') {
      // activeBlockIndex viene impostato DOPO input.focus() in applyPendingChecklistFocus
      // per evitare che il re-render di ⋮/+ su iOS interrompa il focus prima che
      // il browser apra la tastiera virtuale.
      this.pendingFocusChecklistBlockIndex = createdAt;
    }
    this.triggerAutoSave();
  }

  addReminder() {
    if (!this.hasReminderBlock) {
      this.addBlock('reminder');
    }
  }

  removeReminderBlock() {
    const idx = this.note.blocks.findIndex(b => b.type === 'reminder');
    if (idx !== -1) this.removeBlock(idx);
  }

  toggleReminder() {
    if (this.reminderBlock) {
      this.removeReminderBlock();
    } else {
      this.addReminder();
    }
    this.signalActivity();
  }

  addBlockAfterActive(type: NoteBlock['type']) {
    const insertAfter = this.activeTextBlockIndex() ?? this.note.blocks.length - 1;
    this.addBlock(type, insertAfter);
  }

  toggleAddBlockMenu() {
    if (!this.guestCanEdit) return;
    this.addBlockMenuOpen.set(!this.addBlockMenuOpen());
  }

  closeAddBlockMenu() {
    this.addBlockMenuOpen.set(false);
  }

  // onEditorContentClick rimosso: il tap sull'area vuota della nota non apre
  // più la toolbar add-block (comportamento accidentale). Per aggiungere un
  // campo occorre cliccare esplicitamente sul FAB + (.add-block-fab).

  /** Apre il dialog per URL+label, poi inserisce il LinkBlock solo se confermato. */
  async addLinkBlock() {
    const ref = this.dialog.open(LinkDialogComponent, {
      data: { url: '', label: '' },
      width: '420px',
      maxWidth: '95vw'
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    this.saveTextBlocksFromDOM();
    const insertAt = (this.activeTextBlockIndex() ?? this.note.blocks.length - 1) + 1;
    const newBlock: LinkBlock = { type: 'link', url: result.url, label: result.label };
    this.note.blocks = [
      ...this.note.blocks.slice(0, insertAt),
      newBlock,
      ...this.note.blocks.slice(insertAt)
    ];
    this.textBlocksNeedInit = true;
    this.scrollEditorToBottom();
    this.triggerAutoSave();
  }

  /** Riapre il dialog per modificare un LinkBlock esistente. */
  async editLinkBlock(blockIndex: number) {
    const block = this.note.blocks[blockIndex] as LinkBlock;
    const ref = this.dialog.open(LinkDialogComponent, {
      data: { url: block.url, label: block.label ?? '' },
      width: '420px',
      maxWidth: '95vw'
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result) return;
    block.url = result.url;
    block.label = result.label;
  }

  removeBlock(index: number) {
    this.saveTextBlocksFromDOM();
    if (this.activeTextBlockIndex() === index) this.activeTextBlockIndex.set(null);
    this.note.blocks = this.note.blocks.filter((_, i) => i !== index);
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  canRemoveBlock(_index: number): boolean {
    return true;
  }

  /** Sposta il blocco verso l'alto, saltando i reminder (filtrati nel template). */
  moveBlockUp(index: number): void {
    if (!this.note?.blocks || index <= 0) return;
    let prev = index - 1;
    while (prev >= 0 && this.note.blocks[prev].type === 'reminder') prev--;
    if (prev < 0) return;
    this.saveTextBlocksFromDOM();
    const blocks = [...this.note.blocks];
    moveItemInArray(blocks, index, prev);
    this.note.blocks = blocks;
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  /** Sposta il blocco verso il basso, saltando i reminder (filtrati nel template). */
  moveBlockDown(index: number): void {
    if (!this.note?.blocks || index >= this.note.blocks.length - 1) return;
    let next = index + 1;
    while (next < this.note.blocks.length && this.note.blocks[next].type === 'reminder') next++;
    if (next >= this.note.blocks.length) return;
    this.saveTextBlocksFromDOM();
    const blocks = [...this.note.blocks];
    moveItemInArray(blocks, index, next);
    this.note.blocks = blocks;
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  /** True se il blocco all'indice ha almeno un blocco draggabile precedente (non-reminder). */
  canMoveBlockUp(index: number): boolean {
    if (!this.note?.blocks || index <= 0) return false;
    for (let i = index - 1; i >= 0; i--) {
      if (this.note.blocks[i].type !== 'reminder') return true;
    }
    return false;
  }

  /** True se il blocco all'indice ha almeno un blocco draggabile successivo (non-reminder). */
  canMoveBlockDown(index: number): boolean {
    if (!this.note?.blocks || index >= this.note.blocks.length - 1) return false;
    for (let i = index + 1; i < this.note.blocks.length; i++) {
      if (this.note.blocks[i].type !== 'reminder') return true;
    }
    return false;
  }

  // TODO: sostituire con block.id stabile (uuid generato alla creazione) per gestire
  // correttamente riordino e cancellazione senza re-mount dei nodi non coinvolti.
  trackBlock(index: number, _block: NoteBlock): number {
    return index;
  }

  onBlockDrop(event: CdkDragDrop<NoteBlock[]>) {
    this.saveTextBlocksFromDOM();
    // Gli indici CDK si riferiscono al subset dei blocchi effettivamente
    // nel DOM (reminder è filtrato da *ngIf). Convertiamo gli indici
    // nel riferimento dell'array originale.
    const draggable = this.note.blocks
      .map((b, i) => ({ b, i }))
      .filter(x => x.b.type !== 'reminder');
    const realPrev = draggable[event.previousIndex]?.i;
    const realCurr = draggable[event.currentIndex]?.i;
    if (realPrev == null || realCurr == null) return;
    const blocks = [...this.note.blocks];
    moveItemInArray(blocks, realPrev, realCurr);
    this.note.blocks = blocks;
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  // ─── Text Block ─────────────────────────────────────────────────────────────

  onTextInput(blockIndex: number, event: Event) {
    (this.note.blocks[blockIndex] as TextBlock).html = (event.target as HTMLElement).innerHTML;
    this.notifyEditing();
    this.triggerAutoSave();
  }

  onTextFocus(blockIndex: number) {
    if (this._skipTextFocusSignals) return;
    this.activeTextBlockIndex.set(blockIndex);
    this.activeBlockIndex.set(blockIndex);
    this.updateFormatState();
  }

  onTextBlur() {
    this.activeTextBlockIndex.set(null);
    // activeBlockIndex resta finché un click outside non lo resetta:
    // così il trigger menu è cliccabile anche dopo il blur dell'editor.
  }

  /** Imposta il blocco "in interazione" per rivelare il trigger menu (3 dots). */
  setActiveBlock(index: number): void {
    this.activeBlockIndex.set(index);
  }

  /** Apre l'azione di modifica del blocco location/link/image dal menu (3 dots). */
  editBlockFromMenu(index: number): void {
    const block = this.note?.blocks?.[index] as any;
    if (!block) return;
    if (block.type === 'link') {
      this.editLinkBlock(index);
    } else if (block.type === 'location') {
      block.editing = true;
      this.cdr.markForCheck();
    } else if (block.type === 'image') {
      this.pickImageReplacement(index);
    }
  }

  /** Apre un file picker programmatico per sostituire l'immagine del blocco.
   *  onImageBlockFileSelected sovrascrive block.data, quindi la vecchia immagine
   *  viene automaticamente rimpiazzata. */
  private pickImageReplacement(blockIndex: number): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
    input.style.display = 'none';
    input.addEventListener('change', (event) => {
      this.onImageBlockFileSelected(blockIndex, event);
      setTimeout(() => input.remove(), 0);
    });
    document.body.appendChild(input);
    input.click();
  }

  /** Listener globale: click fuori da qualunque .block-item / overlay CDK
   *  (menu, bottom sheet) → nasconde il trigger menu. */
  @HostListener('document:click', ['$event.target'])
  onDocumentClickReset(target: EventTarget | null): void {
    const el = target as HTMLElement | null;
    if (!el || typeof el.closest !== 'function') return;
    if (el.closest('.block-item')) return;
    if (el.closest('.cdk-overlay-container')) return;
    if (this.activeBlockIndex() !== null) this.activeBlockIndex.set(null);
  }

  /** True se il blocco testo è effettivamente vuoto (rendere il placeholder). */
  isEmptyText(html: string | undefined | null): boolean {
    if (html == null) return true;
    const stripped = String(html)
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<div>\s*<\/div>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/&nbsp;/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    return stripped.length === 0;
  }

  updateFormatState() {
    if (typeof document !== 'undefined') {
      this.isBold.set(document.queryCommandState('bold'));
      this.isItalic.set(document.queryCommandState('italic'));
      this.isUnderline.set(document.queryCommandState('underline'));
      this.isStrikethrough.set(document.queryCommandState('strikeThrough'));
      this.isList.set(document.queryCommandState('insertUnorderedList'));
      this.isOrderedList.set(document.queryCommandState('insertOrderedList'));
    }
  }

  execCommand(command: string) {
    if (this.activeTextBlockIndex() !== null) {
      const els = this.textBlockEls.toArray();
      let textIdx = 0;
      for (let i = 0; i < this.note.blocks.length; i++) {
        if (this.note.blocks[i].type === 'text') {
          if (i === this.activeTextBlockIndex() && els[textIdx]) {
            els[textIdx].nativeElement.focus();
          }
          textIdx++;
        }
      }
    }
    document.execCommand(command, false, '');
    setTimeout(() => this.updateFormatState(), 0);
  }

  private saveTextBlocksFromDOM() {
    const els = this.textBlockEls?.toArray() ?? [];
    let textIdx = 0;
    this.note.blocks.forEach(block => {
      if (block.type === 'text') {
        if (els[textIdx]) {
          (block as TextBlock).html = els[textIdx].nativeElement.innerHTML;
        }
        textIdx++;
      }
    });
  }

  // ─── Checklist Block ────────────────────────────────────────────────────────

  /** Click sul trigger "+" inline (ultimo item): aggiunge una voce vuota in
   *  coda e ne fa focus, replicando la logica dell'invio da tastiera. */
  addChecklistItemTrailing(block: ChecklistBlock, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    const newIndex = block.items.length;
    block.items.push({ text: '', done: false });
    this.triggerAutoSave();
    const target = event.currentTarget as HTMLElement | null;
    setTimeout(() => {
      const wrap = target?.closest('.checklist-items')
        ?? this.editorContent?.nativeElement.querySelector('.block-item--active .checklist-items');
      const inputs = wrap?.querySelectorAll<HTMLInputElement>('.checklist-input');
      inputs?.[newIndex]?.focus();
    }, 30);
  }

  /** Invio da un item esistente: inserisce una NUOVA riga vuota subito dopo e
   *  sposta il focus su di essa (comportamento Things/Apple Notes). Se l'item
   *  corrente è vuoto, no-op — evita di creare righe a catena indesiderate. */
  onChecklistItemEnter(event: Event, block: ChecklistBlock, index: number) {
    event.preventDefault();
    const current = block.items[index];
    if (!current || !current.text.trim()) return;
    block.items.splice(index + 1, 0, { text: '', done: false });
    this.triggerAutoSave();
    // Focus sul nuovo input appena il DOM è aggiornato: cerchiamo l'input
    // alla posizione index+1 dentro lo stesso .checklist-items del target.
    const fromEl = event.target as HTMLElement | null;
    setTimeout(() => {
      const wrap = fromEl?.closest('.checklist-items');
      const inputs = wrap?.querySelectorAll<HTMLInputElement>('.checklist-input');
      inputs?.[index + 1]?.focus();
    }, 30);
  }

  removeChecklistItem(block: ChecklistBlock, index: number) {
    block.items.splice(index, 1);
    this.triggerAutoSave();
  }

  /** Blur su un input checklist: se il focus esce dallo stesso .checklist-items
   *  rimuove gli item finali vuoti (utente preme Invio creando l'item, poi blur
   *  senza scrivere). Lascia almeno un item per non rendere il blocco "morto"
   *  privo di trigger "+" inline. */
  onChecklistInputBlur(block: ChecklistBlock, event: FocusEvent): void {
    const next = event.relatedTarget as HTMLElement | null;
    const currentItems = (event.target as HTMLElement | null)?.closest('.checklist-items');
    if (next && currentItems && currentItems.contains(next)) return;
    let changed = false;
    while (block.items.length > 1 && !block.items[block.items.length - 1].text.trim()) {
      block.items.pop();
      changed = true;
    }
    if (changed) {
      this.triggerAutoSave();
      this.cdr.markForCheck();
    }
  }

  /** Salva la modifica al testo di un item: richiede editContent. */
  onChecklistItemChange() {
    if (!this.guestCanEdit) return;
    this.signalActivity();
    this.triggerAutoSave();
  }

  /** Salva il toggle done/undone di un item: disponibile a tutti i collaboratori diretti. */
  onChecklistItemToggle() {
    if (!this.guestCanToggleChecklist) return;
    this.signalActivity();
    this.triggerAutoSave();
  }

  // ─── Location Block ─────────────────────────────────────────────────────────

  private addressSearchTimeout: any;

  /** Estrae il numero civico dalla query digitata (es. "via roma 12B" → "12B").
   *  Tollera suffissi alfabetici brevi (12A, 12bis è meno comune ma ok). */
  private extractHouseNumberFromQuery(q: string): string | null {
    // Ultima sequenza di cifre (con eventuale lettera A-Z) preceduta da spazio
    // o da virgola, posizionata dopo un nome di via plausibile.
    const m = q.match(/(?:^|[\s,])(\d+[A-Za-z]?)(?:\s|,|$)/);
    return m ? m[1] : null;
  }

  onAddressInput(block: any, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    clearTimeout(this.addressSearchTimeout);
    if (!val || val.length < 3) { block.addressOptions = []; this.cdr.detectChanges(); return; }
    this.addressSearchTimeout = setTimeout(async () => {
      try {
        // addressdetails=1 → struttura `address.house_number/road/city/...`
        // accept-language=it → display_name in italiano
        // limit=10 → più risultati (anche Nominatim a volte mette i civici dopo i punti generici)
        const lang = this.translationService.currentLang || 'it';
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&accept-language=${lang}&limit=10&q=${encodeURIComponent(val)}`;
        const res = await fetch(url);
        const raw = await res.json() as any[];
        // Re-rank: i risultati con house_number salgono in cima quando l'utente
        // ha digitato cifre nella query (segnale chiaro: vuole un civico preciso).
        const queryHasNumber = /\d/.test(val);
        const ranked = queryHasNumber
          ? [...raw].sort((a, b) => {
              const ah = a?.address?.house_number ? 1 : 0;
              const bh = b?.address?.house_number ? 1 : 0;
              return bh - ah;
            })
          : raw;
        // Fallback civico: se la query contiene un numero ma OSM non lo ha
        // indicizzato per quella via, aggiungiamo NOI il numero al display
        // (fix per zone italiane con civici mancanti su OpenStreetMap).
        // Il `lat/lon` resta quello della via — la nav app risolve da display_name.
        const queryNumber = this.extractHouseNumberFromQuery(val);
        for (const o of ranked) {
          const a = o.address || {};
          const road = a.road || a.pedestrian || a.footway || '';
          const num = a.house_number || (queryNumber && road ? queryNumber : '');
          const city = a.city || a.town || a.village || a.hamlet || '';
          if (road && num) {
            o.display_label = `${road} ${num}${city ? ', ' + city : ''}`;
            // Sovrascriviamo anche il display_name per coerenza al save.
            if (!a.house_number && queryNumber) {
              o._injected_house_number = queryNumber;
              o.display_name = `${road} ${num}${city ? ', ' + city : ''}, ${o.display_name.replace(road + ',', '').trim()}`;
            }
          } else {
            o.display_label = o.display_name;
          }
        }
        block.addressOptions = ranked;
        this.cdr.detectChanges();
      } catch (e) { console.error(e); }
    }, 600);
  }

  /** Compatta un display_name lungo di Nominatim a "via, città, country".
   *  Heuristica: la "città" è la prima parte (dopo la via) che ricorre più volte
   *  nella stringa; se non trovata, prende la seconda parte. Il country è l'ultima.
   *  Usato come fallback quando block.shortAddress non è disponibile (indirizzi
   *  salvati prima dell'introduzione di shortAddress). */
  compactAddress(displayName: string): string {
    if (!displayName) return '';
    const parts = displayName.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length <= 3) return displayName;
    const via = parts[0];
    const country = parts[parts.length - 1];
    // Trova la prima parte (idx >= 1) che appare almeno 2 volte → tipica
    // ridondanza di Nominatim (city locality + city metropolitan area).
    let city: string | null = null;
    for (let i = 1; i < parts.length - 1; i++) {
      const p = parts[i];
      const dupCount = parts.reduce((n, x) => n + (x === p ? 1 : 0), 0);
      if (dupCount >= 2) { city = p; break; }
    }
    if (!city) city = parts[1]; // fallback: subito dopo la via
    return `${via}, ${city}, ${country}`;
  }

  selectAddress(block: any, option: any) {
    block.address = option.display_name;
    block.lat = parseFloat(option.lat);
    block.lon = parseFloat(option.lon);
    block.searchQuery = '';
    block.editing = false;
    block.mapUrl = this.generateMapUrl(block.lat, block.lon);
    block.addressOptions = [];
    // Versione "pill" compatta dell'indirizzo: solo via [num], città, provincia.
    // Fallback al display_name completo se i campi strutturati mancano.
    const a = option.address || {};
    const road = a.road || a.pedestrian || a.footway || a.path || '';
    const num = a.house_number || option._injected_house_number || '';
    const city = a.city || a.town || a.village || a.hamlet || '';
    const province = a.county || a.state_district || a.state || '';
    const parts: string[] = [];
    if (road) parts.push(num ? `${road} ${num}` : road);
    if (city) parts.push(city);
    if (province && province !== city) parts.push(province);
    block.shortAddress = parts.length > 0 ? parts.join(', ') : option.display_name;
    this.triggerAutoSave();
  }

  clearLocation(block: any) {
    block.address = '';
    block.lat = undefined;
    block.lon = undefined;
    block.mapUrl = undefined;
    block.editing = true;
    this.triggerAutoSave();
  }

  /** Apre coordinate nell'app di navigazione nativa del device.
   *  - iOS: maps.apple.com → Apple Maps anche in PWA standalone
   *  - Android: geo: URI fa aprire il picker app (Google Maps se installato)
   *  - Desktop / fallback: google.com/maps in nuova tab
   *  Usiamo window.open invece di <a target="_blank"> perché iOS PWA
   *  standalone ignora target="_blank" (ricarica la PWA). */
  openMaps(block: LocationBlock) {
    // Aprire la mappa è un'azione di lettura: consentita anche al guest
    // readonly (subscriber del calendario di un evento altrui).
    if (!block.lat || !block.lon) return;
    const query = `${block.lat},${block.lon}`;
    const label = encodeURIComponent(block.address ?? '');
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isAndroid = /Android/i.test(ua);
    let url: string;
    if (isIOS) {
      url = `https://maps.apple.com/?q=${label || query}&ll=${query}`;
    } else if (isAndroid) {
      url = `geo:${query}?q=${query}${label ? '(' + label + ')' : ''}`;
    } else {
      url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /** Apre URL esterna in nuova tab/scheda del browser. Necessario per
   *  bypassare il comportamento iOS PWA standalone che ignora target="_blank"
   *  negli <a> e ricarica la PWA invece di delegare al browser. */
  openExternalUrl(url: string, ev: MouseEvent) {
    if (!url) return;
    ev.preventDefault();
    ev.stopPropagation();
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private generateMapUrl(lat: number, lon: number): SafeResourceUrl {
    // Layer "mapnik" (standard OSM) invece di "hot": rimuove l'overlay
    // informativo pesante del layer Humanitarian. Offset 0.001 = zoom ~18
    // (≈220m diagonale), molto più leggibile per preview urbana.
    const offset = 0.001;
    const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`
    );
  }

  // ─── Reminder Block ─────────────────────────────────────────────────────────

  // hours/minutes array rimossi: input type="time" nativo non ha più bisogno
  // di liste di option. Tutti i minuti sono consentiti (step=60s).

  clearReminder(block: any) {
    block.time = null;
    block.status = null;
    block.date = undefined;
    this.triggerAutoSave();
  }

  onNonTextFieldFocus() { this.nonTextFieldFocused.set(true); }
  onNonTextFieldBlur()  { this.nonTextFieldFocused.set(false); }

  /** Apre il datepicker nascosto per la data start del memo. */
  openMemoStartPicker(): void {
    this.memoStartDp?.open();
  }

  /** Apre il datepicker nascosto per la end date di ricorrenza del memo. */
  openMemoEndPicker(): void {
    this.memoEndDp?.open();
  }

  /** Gestisce il cambio data del datepicker memo-start: preserva l'ora corrente. */
  onMemoStartDateChange(date: Date | null): void {
    if (!date) return;
    const rb = this.reminderBlock;
    if (!rb) return;
    const h = parseInt(rb.hour ?? '12', 10);
    const m = parseInt(rb.minute ?? '00', 10);
    date.setHours(h, m, 0, 0);
    rb.date = date;
    this.onReminderChange();
  }

  /** Getter per il Date corrente del memo-start (per il datepicker [value]).
   *  Usa cache sul timestamp per evitare new Date() ad ogni CD (stesso pattern
   *  di eventStartAsDate — prevenzione loop reference-change → valueChange). */
  private _memoStartDateCache: Date | null = null;
  private _memoStartTimeCache: number | null = null;
  get memoStartAsDate(): Date | null {
    const rb = this.reminderBlock;
    const ts = rb?.time as number | null;
    if (!ts) { this._memoStartDateCache = null; this._memoStartTimeCache = null; return null; }
    if (this._memoStartTimeCache !== ts) {
      this._memoStartDateCache = new Date(ts);
      this._memoStartTimeCache = ts;
    }
    return this._memoStartDateCache;
  }

  onReminderChange() {
    // L'utente ha modificato il reminder → ricalcola time e resetta status/flag evasione
    this.note.blocks.forEach(b => {
      if (b.type === 'reminder') {
        if ((b as any).date) {
          const d = new Date((b as any).date);
          d.setHours(parseInt((b as any).hour ?? '12', 10), parseInt((b as any).minute ?? '00', 10), 0, 0);
          (b as any).time = d.getTime();
        }
        (b as any).status = 'pending';
        (b as any)._evaded = false;
        (b as any)._prevTime = null;
      }
    });
    this.signalActivity();
    this.triggerAutoSave();
  }

  /**
   * Handler <input type="time">: aggiorna hour/minute nel reminderBlock e
   * ricalcola time. Accetta ogni minuto (step=60s), non più solo multipli di 5.
   */
  onReminderTimeInput(val: string): void {
    if (!val) return;
    const parts = val.split(':');
    if (parts.length < 2) return;
    const rb = this.reminderBlock;
    if (!rb) return;
    rb.hour = parts[0].padStart(2, '0');
    rb.minute = parts[1].padStart(2, '0');
    this.onReminderChange();
  }

  onRecurrenceEndDateChange(date: Date | null) {
    const rb = this.reminderBlock;
    if (!rb) return;
    // Scrive sia il timestamp persistito sia il Date runtime usato dal template (*ngIf/_endDate).
    rb.recurrenceEndDate = date ? date.getTime() : null;
    (rb as any)._endDate = date ?? null;
    this.onReminderChange();
  }

  clearRecurrenceEndDate() {
    const rb = this.reminderBlock;
    if (!rb) return;
    rb._endDate = null;
    rb.recurrenceEndDate = null;
    this.onReminderChange();
  }

  markReminderCompleted(block: any, wasOverdue = false): void {
    const recurrence = block.recurrence ?? 'none';
    const isShared = !!(this.note.isShared || (this.note as any).collaboratorUids?.length);
    if (recurrence === 'none') {
      block.status = 'completed';
      if (isShared) this.completionNotifyPendingFlag = true;
      this.triggerAutoSave();
    } else {
      // Usa i campi UI (date/hour/minute) come base, non block.time che potrebbe essere stale
      let currentTime = block.time as number;
      if (block.date) {
        const d = new Date(block.date);
        d.setHours(parseInt(block.hour ?? '12', 10), parseInt(block.minute ?? '00', 10), 0, 0);
        currentTime = d.getTime();
      }
      // Salva timestamp corrente per undo, avanza alla prossima occorrenza
      block._prevTime = currentTime;
      block._evaded = true;
      block._wasOverdue = wasOverdue;
      const nextTime = this.getNextRecurrence(currentTime, block.recurrence);
      if (block.recurrenceEndDate && nextTime > block.recurrenceEndDate) {
        block.status = 'completed';
        block.time = currentTime;
        if (isShared) this.completionNotifyPendingFlag = true;
        this.triggerAutoSave();
        return;
      }
      block.time = nextTime;
      const nextDate = new Date(block.time);
      block.date = nextDate;
      block.hour = nextDate.getHours().toString().padStart(2, '0');
      block.minute = nextDate.getMinutes().toString().padStart(2, '0');
      block.status = 'pending';
      this.triggerAutoSave();
    }
  }

  undoRecurringEvasion(block: any): void {
    if (block._prevTime == null) return; // safe-guard: niente prev → no-op
    block.time = block._prevTime;
    block._prevTime = null;
    block._evaded = false;
    block._wasOverdue = false;
    block.status = 'pending';
    // Ripristina i campi UI usati da buildPayload
    const prevDate = new Date(block.time);
    block.date = prevDate;
    block.hour = prevDate.getHours().toString().padStart(2, '0');
    block.minute = prevDate.getMinutes().toString().padStart(2, '0');
    this.triggerAutoSave();
  }

  isReminderActionable(block: any): boolean {
    if (!this.note?.id) return false;
    if ((block.status as string) === 'completed') return false;
    if ((block.recurrence ?? 'none') !== 'none') {
      // Overdue-recurring ora è actionable: checkbox hero evade l'istanza
      // corrente (con wasOverdue=true). Sostituisce il vecchio CTA ghost.
      return !block._evaded;
    }
    return true;
  }

  isSingleOverdue(block: any): boolean {
    if ((block.recurrence ?? 'none') !== 'none') return false;
    if ((block.status as string) === 'completed') return false;
    let effectiveTime: number | null = block.time;
    if (block.date) {
      const d = new Date(block.date);
      d.setHours(parseInt(block.hour ?? '12', 10), parseInt(block.minute ?? '00', 10), 0, 0);
      effectiveTime = d.getTime();
    }
    return effectiveTime != null && effectiveTime + 60_000 < Date.now();
  }

  isOverdueRecurring(block: any): boolean {
    if ((block.recurrence ?? 'none') === 'none' || block._evaded) return false;
    let effectiveTime: number | null = block.time;
    if (block.date) {
      const d = new Date(block.date);
      d.setHours(parseInt(block.hour ?? '12', 10), parseInt(block.minute ?? '00', 10), 0, 0);
      effectiveTime = d.getTime();
    }
    return effectiveTime != null && effectiveTime < Date.now();
  }


  getReminderActionLabel(_block: any): string {
    // Il badge ricorrente mostra "Evaso — prossima [data]"; il bottone mostra sempre questo
    return 'Segna come evaso';
  }

  private checkStalledEvasion(block: any): void {
    if (block._evaded && block._wasOverdue && block.time <= Date.now()) {
      block._evaded = false;
      block._wasOverdue = false;
    } else if (block._evaded && block._prevTime) {
      const prevDay = new Date(block._prevTime).setHours(0, 0, 0, 0);
      const today = new Date().setHours(0, 0, 0, 0);
      if (prevDay < today) {
        block._evaded = false;
        block._prevTime = null;
      }
    }
  }

  private getNextRecurrence(currentTime: number, recurrence: string): number {
    const d = new Date(currentTime);
    switch (recurrence) {
      case 'daily':   d.setDate(d.getDate() + 1); break;
      case 'weekly':  d.setDate(d.getDate() + 7); break;
      case 'monthly': d.setMonth(d.getMonth() + 1); break;
      case 'yearly':  d.setFullYear(d.getFullYear() + 1); break;
    }
    return d.getTime();
  }

  getNextRecurrenceLabel(block: any): string {
    if (!block.time || !block.recurrence || block.recurrence === 'none') return '';
    const next = this.getNextRecurrence(block.time, block.recurrence);
    return new Date(next).toLocaleDateString(this.translationService.locale, { day: 'numeric', month: 'short' });
  }

  // ─── Image Block ────────────────────────────────────────────────────────────
  // TODO: upload immagini disabilitato — riabilitare quando si cambia piano Firebase Storage

  /*
  async onImageSelected(blockIndex: number, event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;

    const storage = getStorage(getApp());
    const path = `notes/${uid}/${Date.now()}_${file.name}`;
    const fileRef = storageRef(storage, path);
    const task = uploadBytesResumable(fileRef, file);

    this.uploadProgress.set(blockIndex, 0);
    this.cdr.detectChanges();

    task.on(
      'state_changed',
      snap => {
        this.uploadProgress.set(blockIndex, Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        this.cdr.detectChanges();
      },
      err => {
        this.uploadProgress.delete(blockIndex);
        console.error('[Storage] Upload failed:', err.code, err.message);
        this.cdr.detectChanges();
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        const block = this.note.blocks[blockIndex] as ImageBlock;
        block.url = url;
        block.storagePath = path;
        this.uploadProgress.delete(blockIndex);
        this.cdr.detectChanges();
      }
    );
  }

  async removeImage(block: ImageBlock) {
    if (block.storagePath) {
      try {
        await deleteObject(storageRef(getStorage(getApp()), block.storagePath));
      } catch { }
    }
    block.url = '';
    block.storagePath = '';
    this.triggerAutoSave();
  }
  */

  // TODO: tags disabilitati temporaneamente
  // addTag() { ... }
  // removeTag(tag: string) { ... }

  // ─── Auto-save ──────────────────────────────────────────────────────────────

  private buildPayload(): any {
    this.saveTextBlocksFromDOM();
    const blocks: NoteBlock[] = this.note.blocks.map(block => {
      if (block.type === 'reminder') {
        const rb = block as any;
        // notifyOffsetMin: persisti solo se valorizzato e > 0 (0 = AT_START = default).
        const notifyOffsetMin: number | undefined =
          typeof rb.notifyOffsetMin === 'number' && rb.notifyOffsetMin > 0
            ? rb.notifyOffsetMin
            : undefined;
        if (rb.date) {
          const d = new Date(rb.date);
          d.setHours(parseInt(rb.hour ?? '12', 10));
          d.setMinutes(parseInt(rb.minute ?? '00', 10));
          d.setSeconds(0); d.setMilliseconds(0);
          // Preserva lo status esistente (es. 'sent', 'completed'): solo onReminderChange lo resetta a 'pending'
          const status: 'pending' | 'sent' | 'completed' | null = rb.status ?? 'pending';
          const reminderOut: ReminderBlock & { evaded: boolean; wasOverdue: boolean } = {
            type: 'reminder', time: d.getTime(), recurrence: rb.recurrence ?? 'none',
            recurrenceEndDate: rb.recurrenceEndDate ?? null, status,
            evaded: rb._evaded ?? false, wasOverdue: rb._wasOverdue ?? false,
          } as any;
          if (notifyOffsetMin !== undefined) (reminderOut as any).notifyOffsetMin = notifyOffsetMin;
          return reminderOut;
        }
        return { type: 'reminder' as const, time: null, recurrence: rb.recurrence ?? 'none',
          recurrenceEndDate: rb.recurrenceEndDate ?? null, status: null,
          evaded: false, wasOverdue: false };
      }
      if (block.type === 'location') {
        const lb = block as any;
        return { type: 'location' as const, address: lb.address ?? '', lat: lb.lat, lon: lb.lon };
      }
      return block;
    });
    const reminder = blocks.find(b => b.type === 'reminder') as ReminderBlock | undefined;
    const textHtml = (blocks.filter(b => b.type === 'text') as TextBlock[]).map(b => b.html).join('');
    const repeatValue = reminder?.recurrence && reminder.recurrence !== 'none'
      ? reminder.recurrence as 'daily' | 'weekly' | 'monthly' | 'yearly'
      : null;
    // Per eventi: i reminder vivono nel sub-doc per-utente
    // notes/{eventId}/eventReminders/{uid}, NON sul doc evento. Quindi i campi
    // reminder top-level vengono azzerati al save (anche per migrare via gli
    // eventuali legacy reminderTime degli eventi esistenti).
    const isEvent = this.note.type === 'event';
    // notifyOffsetMin flat: esposto top-level perché il server legge `note.reminderTime`
    // flat. Con l'offset, il server calcola notifyTime = reminderTime - notifyOffsetMin*60000.
    // Assente (undefined→null) = retrocompat offset 0.
    const reminderNotifyOffset: number | null =
      !isEvent && reminder && typeof (reminder as any).notifyOffsetMin === 'number' && (reminder as any).notifyOffsetMin > 0
        ? (reminder as any).notifyOffsetMin
        : null;
    const payload: any = {
      ...this.note,
      blocks,
      tags: this.note.tags ?? [],
      reminderTime: isEvent ? null : (reminder?.time ?? null),
      reminderStatus: isEvent ? null : (reminder?.status ?? null),
      recurrence: isEvent ? 'none' : (reminder?.recurrence ?? 'none'),
      reminderRepeat: isEvent ? null : repeatValue,
      recurrenceEndDate: isEvent ? null : (reminder?.recurrenceEndDate ?? null),
      notifyOffsetMin: reminderNotifyOffset,
    };
    delete payload.address; delete payload.lat; delete payload.lon; delete payload.checklist;
    // Strip read-only ownership/sharing metadata — mai scrivibili dal client direttamente
    delete payload.uid; delete payload.id; delete payload.myRole;
    delete payload.myPermissions; delete payload.isShared; delete payload.collaboratorUids;
    // Top-level image cleanup (ora l'immagine vive in blocks[] come ImageBlock).
    if (payload.image !== undefined) payload.image = null;
    // Completion notify flags: emetti solo una tantum dopo markReminderCompleted su shared note
    if (this.completionNotifyPendingFlag) {
      const uid = this.authService.getCurrentUserId();
      payload.completionNotifyPending = true;
      payload.completionNotifyBy = uid;
      payload.completionNotifyByName = this.myUsername || this.translationService.instant('SHARING.UNKNOWN_COLLABORATOR');
      payload.completionNotifyAt = Date.now();
      this.completionNotifyPendingFlag = false;
    }
    // Fase 4 A.1: propaga calendarId per eventi nuovi (initialCalendarId dal dashboard).
    // Per editing di nota esistente, calendarId arriva già da this.note via spread.
    if (this.note.type === 'event' && this.initialCalendarId && !payload.calendarId) {
      payload.calendarId = this.initialCalendarId;
    }
    // Per eventi: eventEnd è opzionale. Le rules richiedono `eventEnd is number`
    // se la key esiste (null non è number). Rimuovi del tutto se non valorizzato,
    // altrimenti il forEach undefined→null sotto creerebbe un payload invalido.
    if (this.note.type === 'event' && typeof payload.eventEnd !== 'number') {
      delete payload.eventEnd;
    }
    Object.keys(payload).forEach(k => { if (payload[k] === undefined) payload[k] = null; });
    return payload;
  }

  private isPristine(): boolean {
    if (this.userHasModifiedContent) return false;
    const title = (this.note.title || '').trim();
    if (title && title !== this.PLACEHOLDER_TITLE) return false;
    // Se c'è un reminder block con tempo configurato, la nota non è pristine
    const hasConfiguredReminder = this.note.blocks.some(b => b.type === 'reminder' && (b as any).time);
    if (hasConfiguredReminder) return false;
    return true;
  }

  triggerAutoSave() {
    this.userHasModifiedContent = true;
    if (this.savedNoteId) {
      this.noteLiveUpdate.emit({ id: this.savedNoteId, title: this.note.title || '' });
    }
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.performAutoSave(), 800);
  }

  private async performAutoSave() {
    this.autoSaveTimer = null;
    if (!this.savedNoteId) return;
    this.pendingOwnWrite = true;
    const payload = this.buildPayload();
    console.log('[AutoSave] updateNote — noteId:', this.savedNoteId,
      'blocks:', payload.blocks?.length, 'title:', payload.title?.slice?.(0, 30));
    try {
      await this.noteService.updateNote(this.savedNoteId, payload);
      this.lastSavedAt = Date.now();
      console.log('[AutoSave] updateNote OK — lastSavedAt:', this.lastSavedAt);
    } catch (err) {
      console.error('[DBG-EVT-SAVE] updateNote FAILED', { code: (err as any)?.code, message: (err as any)?.message, err });
    } finally {
      this.pendingOwnWrite = false;
    }
  }

  async handleClose() {
    clearTimeout(this.autoSaveTimer);
    // Attendi che la createNote sia completata (evita note orfane se l'utente chiude troppo in fretta)
    if (this.createNotePromise) await this.createNotePromise.catch(() => {});
    if (this.isNewNote && this.savedNoteId && this.isPristine()) {
      // Nuova nota senza contenuto reale → cancella
      try { await this.noteService.deleteNote(this.savedNoteId); } catch { /* ignora */ }
    } else if (this.savedNoteId && this.userHasModifiedContent) {
      // L2: salva solo se l'owner ha effettivamente modificato qualcosa —
      // evita di sovrascrivere con stato stale se la nota era condivisa runtime (BF-GG).
      // L3: fresh read prima del save — se il remote è più aggiornato del nostro stato,
      // non sovrascrivere (un solo read per sessione, non per keystroke).
      try {
        const remoteAt = await this.noteService.getNoteUpdatedAt(this.savedNoteId);
        if (remoteAt && remoteAt > this.lastSavedAt) {
          console.warn('[anti-overwrite] handleClose bail — remoteAt:', remoteAt, 'lastSavedAt:', this.lastSavedAt);
          this.closeEditor.emit(this.note ?? null);
          return;
        }
      } catch { /* errore di rete: procedi con il save */ }
      await this.performAutoSave();
    }
    this.closeEditor.emit(this.note ?? null);
  }

  onTitleChange() {
    this.notifyEditing();
    this.triggerAutoSave();
  }

  undoReminderCompleted(block: any): void {
    block.status = 'pending';
    this.triggerAutoSave();
  }

  // ─── Live sync ──────────────────────────────────────────────────────────────

  private startLiveSync() {
    if (!this.savedNoteId) return;
    this.stopLiveSync();

    // watchNote sempre attivo — necessario per ricevere update dal guest anche su note
    // che non erano ancora shared al momento dell'apertura (BF-GG fix).
    this.liveNoteUnsub = this.noteService.watchNote(this.savedNoteId, async (rawData) => {
      // Aggiungi id al payload raw per decryptNoteDoc (watchNote non lo include di default)
      const data = { ...rawData, id: this.savedNoteId };
      const remoteAt = data['updatedAt'] as number | undefined;
      console.log('[watchNote] snapshot — noteId:', this.savedNoteId,
        'remoteAt:', remoteAt, 'lastSavedAt:', this.lastSavedAt,
        'role:', this.note.myRole, 'autoSaveTimer:', this.autoSaveTimer !== null,
        'pendingOwnWrite:', this.pendingOwnWrite,
        'collaboratorUids:', data['collaboratorUids']);

      // Guest kick (data path): controlla sul raw prima del decrypt — collaboratorUids non è cifrato.
      // Gli eventi di calendar usano subscription al calendario (non collaboratorUids) per l'accesso
      // del guest: la check su collaboratorUids ritornerebbe sempre "kick" → skip per type='event'.
      if (this.note.myRole === 'guest' && this.note.type !== 'event') {
        const uid = this.authService.getCurrentUserId();
        const collabs: string[] = data['collaboratorUids'] ?? [];
        if (uid && !collabs.includes(uid)) {
          console.log('[watchNote] guest kick — uid not in collaboratorUids');
          this._handleKickout('removed');
          return;
        }
      }
      if (this.autoSaveTimer !== null || this.pendingOwnWrite) {
        console.log('[watchNote] skip — user editing or own write in flight');
        return; // utente sta modificando o scrittura in volo
      }
      if (!remoteAt || remoteAt <= this.lastSavedAt) {
        console.log('[watchNote] skip — remoteAt', remoteAt, '<= lastSavedAt', this.lastSavedAt, '(own echo or stale)');
        return;
      }

      // Decifra il doc raw prima di applicarlo all'editor.
      // watchNote riceve il doc direttamente da Firestore (non passato per lo stream getNotes()),
      // quindi title/blocks sono ancora AES1: ciphertext per le note condivise.
      const decrypted = await this.noteService.decryptNoteDoc(data);
      if (!decrypted) {
        // Chiave non disponibile (race transitoria) — mantieni lo stato UI corrente.
        console.warn('[editor] watchNote: skip apply — decrypt not ready for noteId:', this.savedNoteId);
        return;
      }
      console.log('[editor] watchNote: apply remote update — noteId:', this.savedNoteId,
        'remoteAt:', remoteAt, 'blocks:', decrypted['blocks']?.length ?? '(string)');
      this.applyRemoteUpdate(decrypted);
    }, (err) => {
      // Guest kick (error path): quando il guest viene rimosso dai collaboratorUids,
      // Firestore rules negano la lettura di notes/{noteId}. L'onSnapshot emette un
      // errore permission-denied invece della doc aggiornata — il data callback non
      // viene mai chiamato. Trattiamo l'errore come segnale di kick-out.
      if (this.note.myRole === 'guest') {
        if (err?.code === 'not-found') {
          this._handleKickout('deleted');
        } else if (err?.code === 'permission-denied') {
          // permission-denied = rimosso da collaboratorUids (regole Firestore).
          // Non distinguiamo doc-deleted qui perché watchNote già lo gestisce via not-found.
          this._handleKickout('removed');
        }
      }
    });

    // Presence e permessi: solo per note condivise (ha senso solo in presenza di collaboratori)
    if (this.note.isShared || this.note.myRole === 'guest') {
      this.startPermissionsSync();
      this.startPresence(this.savedNoteId);
    }
  }

  private stopLiveSync() {
    if (this.liveNoteUnsub) { this.liveNoteUnsub(); this.liveNoteUnsub = null; }
    if (this.livePermsUnsub) { this.livePermsUnsub(); this.livePermsUnsub = null; }
    clearTimeout(this.syncStateTimer);
    this.syncState.set('idle');
    this.stopPresence();
    this.stopEventReminderWatcher();
  }

  /** Kick-out handler condiviso tra data-path (collaboratorUids / not-found) e error-path (permission-denied). */
  private async _handleKickout(reason: 'removed' | 'deleted' = 'removed') {
    this.stopLiveSync();
    const title = (this.note?.title ?? '').trim();
    const ownerUid = (this.note as any)?.uid ?? '';
    let username = ownerUid ? ownerUid.slice(0, 8) : '';
    if (ownerUid) {
      try {
        const resolved = await this.noteService.getUsernameByUid(ownerUid);
        if (resolved) username = resolved;
      } catch { /* fallback sul prefisso uid */ }
    }
    const keyBase = reason === 'deleted' ? 'NOTE.DELETED_BY_OWNER' : 'NOTE.REMOVED_BY_OWNER';
    const key = title ? keyBase : `${keyBase}_NO_TITLE`;
    const msg = this.translationService.instant(key, { title, username });
    this.ngZone.run(() => {
      this.toast.show(msg, 5000);
      this.closeEditor.emit(this.note ?? null);
    });
  }

  // ─── Presence ─────────────────────────────────────────────────────────────

  private async startPresence(noteId: string) {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;

    // Risolvi displayName (username o primo char dell'uid)
    if (!this.selfDisplayName) {
      const username = await this.noteService.getUsername().catch(() => null);
      this.selfDisplayName = username ?? uid.charAt(0).toUpperCase();
    }

    // Scrivi presenza iniziale
    await this.noteService.writePresence(noteId, uid, this.selfDisplayName, false);

    // Snapshot listener presenze altrui
    this.presenceUnsub = this.noteService.watchPresence(noteId, uid, (users) => {
      this.presenceUsers.set(users);
      this.cdr.markForCheck();
    });

    // Heartbeat ogni 15s per mantenere lastSeen fresco
    this.presenceHeartbeat = setInterval(() => {
      if (this.savedNoteId) {
        this.noteService.writePresence(this.savedNoteId, uid, this.selfDisplayName!, this.presenceEditing);
      }
    }, 15_000);

    // Rimuovi presenza se l'utente chiude la tab/finestra
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  private stopPresence() {
    if (this.presenceUnsub) { this.presenceUnsub(); this.presenceUnsub = null; }
    clearInterval(this.presenceHeartbeat);
    this.presenceHeartbeat = null;
    clearTimeout(this.editingTimeout);
    this.editingTimeout = null;
    this.presenceEditing = false;
    this.presenceUsers.set([]);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    // Elimina presenza da Firestore (fire-and-forget)
    const uid = this.authService.getCurrentUserId();
    if (uid && this.savedNoteId) {
      this.noteService.deletePresence(this.savedNoteId, uid);
    }
  }

  /** Segnala un'attività non-typing (checklist toggle, cambio colore, reminder) per far pulsare il FAB sui collaboratori. */
  signalActivity() {
    if (!this.savedNoteId) return;
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.selfDisplayName) return;
    this.noteService.writePresence(this.savedNoteId, uid, this.selfDisplayName, this.presenceEditing, Date.now());
  }

  // ─── Snooze (FE-01) ─────────────────────────────────────────────────────────

  /** Toggle dello snooze-mute sheet (Fase 1 campanella). Disponibile solo per memo/event.
   *  Click con sheet già aperto → chiude, per parità col create-fab + settings dropdown. */
  openSnoozeSheet() {
    if (!this.savedNoteId) return;
    if (this.note.type === 'note') return;
    this.showSnoozeSheet.update(v => !v);
  }

  /** Mini-FAB campanella.
   * - event  → preset sheet (reminder per-user sub-doc)
   * - memo   → preset sheet notifica (openMemoReminderPill) — il FAB è la stessa azione della pill nera
   * - note   → non dovrebbe accadere (FAB nascosto per type='note')
   */
  onBellTap(): void {
    if (this.note?.type === 'event') {
      this.openReminderPresetSheet();
    } else if (this.note?.type === 'memo') {
      this.openMemoReminderPill();
    } else {
      this.openSnoozeSheet();
    }
  }

  async snoozeReminder(timestamp: number) {
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.savedNoteId) return;
    this.showSnoozeSheet.set(false);
    this.snoozedUntil.set(timestamp);
    this.reminderMuted.set(false);
    this.snoozeConfirmPending = false;
    await this.noteService.writeReminderSubscription(this.savedNoteId, uid, {
      muted: false,
      snoozedUntil: timestamp,
    }).catch(() => {});
  }

  async muteReminder() {
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.savedNoteId) return;
    this.showSnoozeSheet.set(false);
    this.reminderMuted.set(true);
    this.snoozedUntil.set(null);
    await this.noteService.writeReminderSubscription(this.savedNoteId, uid, {
      muted: true,
      snoozedUntil: null,
    }).catch(() => {});
  }

  async reactivateReminder() {
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.savedNoteId) return;
    this.showSnoozeSheet.set(false);
    this.reminderMuted.set(false);
    this.snoozedUntil.set(null);
    await this.noteService.writeReminderSubscription(this.savedNoteId, uid, {
      muted: false,
      snoozedUntil: null,
    }).catch(() => {});
  }

  async cancelSnooze() {
    if (!this.snoozeConfirmPending) {
      // Primo tap: mostra messaggio di conferma
      this.snoozeConfirmPending = true;
      setTimeout(() => { this.snoozeConfirmPending = false; }, 3000);
      return;
    }
    // Secondo tap: esegui → riattiva (stesso effetto di reactivateReminder)
    this.snoozeConfirmPending = false;
    await this.reactivateReminder();
  }

  private startSnoozeWatcher() {
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.savedNoteId) return;
    this.snoozeUnsub?.();
    this.snoozeUnsub = this.noteService.watchReminderSubscription(this.savedNoteId, uid, (sub) => {
      this.reminderMuted.set(!!sub?.muted);
      this.snoozedUntil.set(sub?.snoozedUntil ?? null);
    });
  }

  /** Segnala che l'utente sta modificando: aggiorna isEditing:true, resetta dopo 3s di inattività. */
  notifyEditing() {
    if (!this.savedNoteId) return;
    const uid = this.authService.getCurrentUserId();
    if (!uid || !this.selfDisplayName) return;
    if (!this.presenceEditing) {
      this.presenceEditing = true;
      this.noteService.writePresence(this.savedNoteId, uid, this.selfDisplayName, true);
    }
    clearTimeout(this.editingTimeout);
    this.editingTimeout = setTimeout(() => {
      this.presenceEditing = false;
      if (this.savedNoteId) {
        this.noteService.writePresence(this.savedNoteId, uid, this.selfDisplayName!, false);
      }
    }, 3_000);
  }

  private readonly onBeforeUnload = () => {
    const uid = this.authService.getCurrentUserId();
    if (uid && this.savedNoteId) {
      // Sincrono best-effort (navigator.sendBeacon non disponibile per Firestore)
      this.noteService.deletePresence(this.savedNoteId, uid);
    }
  };

  private startPermissionsSync() {
    if (!this.savedNoteId || this.note.myRole !== 'guest') return;
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;
    if (this.livePermsUnsub) { this.livePermsUnsub(); this.livePermsUnsub = null; }
    this.livePermsUnsub = this.noteService.watchCollaboratorPermissions(
      this.savedNoteId, uid, (perms) => {
        (this.note as any).myPermissions = perms ?? undefined;
        this.cdr.markForCheck();
      }
    );
  }

  private applyRemoteUpdate(data: any) {
    const blocks = migrateToBlocks(data);
    blocks.forEach(block => {
      if (block.type === 'location') {
        const lb = block as any;
        lb.searchQuery = lb.searchQuery || '';
        lb.addressOptions = [];
        lb.editing = !lb.address;
        if (lb.lat && lb.lon) lb.mapUrl = this.generateMapUrl(lb.lat, lb.lon);
      }
      if (block.type === 'reminder') {
        const rb = block as any;
        if (rb.time) {
          const d = new Date(rb.time);
          rb.date = d;
          rb.hour = d.getHours().toString().padStart(2, '0');
          rb.minute = d.getMinutes().toString().padStart(2, '0');
        }
        rb._evaded = rb.evaded ?? false;
        rb._wasOverdue = rb.wasOverdue ?? false;
        rb._endDate = rb.recurrenceEndDate ? new Date(rb.recurrenceEndDate) : null;
        this.checkStalledEvasion(rb);
      }
    });
    // Completion toast (FE-01 fase 6.5): se un collaboratore ha completato il reminder
    const uid = this.authService.getCurrentUserId();
    const newRb = blocks.find(b => b.type === 'reminder') as any;
    const newCB: string | null = newRb?.completedBy ?? null;
    if (newCB && newCB !== uid && newCB !== this.prevCompletedBy) {
      const presenceName = this.presenceUsers().find(u => u.uid === newCB)?.displayName ?? null;
      const resolveAndToast = async () => {
        let displayName: string;
        if (presenceName) {
          displayName = presenceName;
        } else if (this.usernameCache.has(newCB)) {
          displayName = this.usernameCache.get(newCB)!;
        } else {
          const fetched = await this.noteService.getUsernameByUid(newCB);
          displayName = fetched ?? newCB.slice(0, 8);
          if (fetched) this.usernameCache.set(newCB, fetched);
        }
        this.toast.show(
          `${displayName} ${this.translationService.instant('EDITOR.COMPLETED_REMINDER_TOAST')}`,
          4500,
          'info'
        );
      };
      resolveAndToast();
    }
    this.prevCompletedBy = newCB;

    const remoteCollabUids: string[] = Array.isArray(data['collaboratorUids']) ? data['collaboratorUids'] : [];
    console.log('[applyRemoteUpdate] applying — noteId:', this.savedNoteId,
      'remoteAt:', data['updatedAt'], 'lastSavedAt (unchanged):', this.lastSavedAt,
      'blocks count:', blocks.length, 'collaboratorUids:', remoteCollabUids.length);
    const isEventDoc = data['type'] === 'event' || this.note.type === 'event';
    this.note = {
      ...this.note,
      title: data['title'] ?? this.note.title,
      blocks,
      // Sincronizza anche lo stato di sharing: l'icona share-mini-fab deve diventare
      // "group" non appena un guest accetta l'invito (collaboratorUids cresce remoto).
      collaboratorUids: remoteCollabUids,
      isShared: remoteCollabUids.length > 0,
      // Eventi: propaga al guest gli spostamenti di start/end e i cambi di calendario
      // o di stato cancelled. Senza questo il guest non vede in tempo reale che
      // l'owner ha spostato l'evento, e la pill reminder mostra l'orario sbagliato.
      ...(isEventDoc ? {
        eventStart: typeof data['eventStart'] === 'number' ? data['eventStart'] : this.note.eventStart,
        eventEnd: typeof data['eventEnd'] === 'number'
          ? data['eventEnd']
          : (data['eventEnd'] === null ? undefined : this.note.eventEnd),
        calendarId: typeof data['calendarId'] === 'string' ? data['calendarId'] : this.note.calendarId,
        cancelled: data['cancelled'] === true,
      } : {}),
    };
    // Per type=event: ricalcola reminderTime locale dal nuovo eventStart × offset
    // attuale, così la pill reminder si aggiorna senza aspettare il watcher subdoc.
    if (isEventDoc && this.reminderEnabled && typeof this.note.eventStart === 'number') {
      const offsetMin = this.presetOffsetMin(this.reminderPresetKey);
      if (typeof offsetMin === 'number') {
        this.note.reminderTime = this.note.eventStart - offsetMin * 60_000;
      }
    }
    // NOTE: lastSavedAt is intentionally NOT updated here.
    // It tracks the timestamp of our OWN writes (set in performAutoSave) to filter
    // Firestore echo-back. Updating it from remote snapshots would block subsequent
    // remote updates when T_remote2 <= T_remote1 (BUG 28 root cause).
    this.textBlocksNeedInit = true;
    // Indicatore sync: sync-spinner (600ms) → spunta (1.5s) → nascosto
    clearTimeout(this.syncStateTimer);
    this.syncState.set('syncing');
    this.syncStateTimer = setTimeout(() => {
      this.syncState.set('synced');
      this.syncStateTimer = setTimeout(() => this.syncState.set('idle'), 1500);
    }, 600);
    this.cdr.markForCheck();
  }

  ngOnDestroy() {
    this.snoozeUnsub?.();
    this.stopLiveSync();
    this.vvResizeListener?.();
    if (this.overdueTicker) { clearInterval(this.overdueTicker); this.overdueTicker = null; }
    if (this.memoInlineToastTimer) { clearTimeout(this.memoInlineToastTimer); this.memoInlineToastTimer = null; }
    // Forza sincronizzazione valore input titolo prima di salvare (fix: swipe-back senza blur)
    if (this.titleInputRef?.nativeElement) {
      this.note.title = this.titleInputRef.nativeElement.value;
    }
    clearTimeout(this.autoSaveTimer);
    if (this.isNewNote && this.isPristine()) {
      // Distrutto via back-button (non via handleClose): cancella la nota pristine in background
      (async () => {
        if (this.createNotePromise) await this.createNotePromise.catch(() => {});
        if (this.savedNoteId) this.noteService.deleteNote(this.savedNoteId).catch(() => {});
      })();
    } else if (this.savedNoteId && this.userHasModifiedContent) {
      // Salva eventuali modifiche pendenti (timer interrotto dal destroy)
      this.performAutoSave().catch(() => {});
    }
  }

  /** now + 5min, arrotondato al prossimo multiplo di 5 minuti */
  computeDefaultReminderDate(): Date {
    const base = new Date(Date.now() + 5 * 60 * 1000);
    const roundedMinutes = Math.ceil(base.getMinutes() / 5) * 5;
    const d = new Date(base);
    if (roundedMinutes >= 60) {
      d.setHours(d.getHours() + 1);
      d.setMinutes(roundedMinutes - 60, 0, 0);
    } else {
      d.setMinutes(roundedMinutes, 0, 0);
    }
    return d;
  }
}
