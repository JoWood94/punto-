import {
  Component, Input, Output, EventEmitter, inject, OnInit, OnChanges, OnDestroy,
  SimpleChanges, ViewChildren, ViewChild, QueryList, ElementRef, ChangeDetectorRef,
  AfterViewInit, AfterViewChecked, DoCheck, signal, NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
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
    MatSelectModule, MatChipsModule, MatMenuModule, MatDialogModule,
    DragDropModule, TranslateModule,
    SnoozeSheetComponent,
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss']
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
  @Output() closeEditor = new EventEmitter<boolean>();
  @Output() noteCreated = new EventEmitter<string>();
  @Output() noteLiveUpdate = new EventEmitter<{id: string, title: string}>();

  /** Collects only #textBlockEl refs (one per text block, in ngFor order). */
  @ViewChildren('textBlockEl') textBlockEls!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('editorContent') editorContent!: ElementRef<HTMLElement>;
  @ViewChild('titleInput') titleInputRef!: ElementRef<HTMLInputElement>;

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

  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  private cryptoService = inject(CryptoService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private ngZone = inject(NgZone);
  private overdueTicker: ReturnType<typeof setInterval> | null = null;
  private dialog = inject(MatDialog);
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

  get hasReminderBlock(): boolean {
    return this.note.blocks.some(b => b.type === 'reminder');
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
        this.closeEditor.emit(this.note?.blocks?.some(b => b.type === 'reminder') ?? false);
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
    el.focus();
    // Posiziona il cursore alla fine del contenuto
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
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
      this.lastSavedAt = this.selectedNote.updatedAt ?? 0;
      this.stopLiveSync();
      this.startLiveSync();
      this.startSnoozeWatcher();
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
      if (this.initialReminderDate) {
        // Da vista Promemoria o da calendario: blocco reminder, nessun titolo di default
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
      this.createNotePromise = this.noteService.createNote(this.buildPayload())
        .then(result => {
          this.savedNoteId = result.id;
          (this.note as any).id = result.id;
          this.noteCreated.emit(result.id);
          this.startSnoozeWatcher();
          // watchNote deve partire anche sulle note appena create: quando più tardi
          // il guest accetta l'invito, l'owner deve già essere iscritto per ricevere
          // gli update live senza dover riaprire la nota.
          this.startLiveSync();
        })
        .catch(err => console.error('[AutoSave] createNote error:', err));
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
        newBlock = { type: 'checklist', items: [] } as ChecklistBlock;
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
    if (isOnlyEmptyText) {
      this.note.blocks = [newBlock];
    } else {
      const insertAt = afterIndex !== undefined ? afterIndex + 1 : this.note.blocks.length;
      this.note.blocks = [
        ...this.note.blocks.slice(0, insertAt),
        newBlock,
        ...this.note.blocks.slice(insertAt)
      ];
      if (type === 'text') this.pendingFocusBlockIndex = insertAt;
    }
    this.textBlocksNeedInit = true;
    // I blocchi testo si auto-focalizzano: iOS keyboard avoidance gestisce lo scroll.
    // scrollEditorToBottom sovrascrive quella posizione e mostra il nuovo blocco
    // in fondo con il padding-bottom bianco visibile sopra la toolbar.
    if (type !== 'text') this.scrollEditorToBottom();
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
    this.activeTextBlockIndex.set(blockIndex);
    this.updateFormatState();
  }

  onTextBlur() {
    this.activeTextBlockIndex.set(null);
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

  addChecklistItem(block: ChecklistBlock, text: string) {
    if (text.trim()) {
      block.items.push({ text: text.trim(), done: false });
      this.scrollEditorToBottom();
      this.triggerAutoSave();
    }
  }

  onChecklistEnter(event: Event, block: ChecklistBlock, input: HTMLInputElement) {
    event.preventDefault(); // evita newline / submit su mobile
    const text = input.value;
    this.addChecklistItem(block, text);
    input.value = '';
    // Su iOS il focus sincrono dopo clear non funziona — setTimeout necessario
    setTimeout(() => input.focus(), 30);
  }

  removeChecklistItem(block: ChecklistBlock, index: number) {
    block.items.splice(index, 1);
    this.triggerAutoSave();
  }

  onChecklistItemChange() {
    if (!this.guestCanEdit) return;
    this.signalActivity();
    this.triggerAutoSave();
  }

  // ─── Location Block ─────────────────────────────────────────────────────────

  private addressSearchTimeout: any;

  onAddressInput(block: any, event: Event) {
    const val = (event.target as HTMLInputElement).value;
    clearTimeout(this.addressSearchTimeout);
    if (!val || val.length < 3) { block.addressOptions = []; this.cdr.detectChanges(); return; }
    this.addressSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5`
        );
        block.addressOptions = await res.json();
        this.cdr.detectChanges();
      } catch (e) { console.error(e); }
    }, 600);
  }

  selectAddress(block: any, option: any) {
    block.address = option.display_name;
    block.lat = parseFloat(option.lat);
    block.lon = parseFloat(option.lon);
    block.searchQuery = '';
    block.editing = false;
    block.mapUrl = this.generateMapUrl(block.lat, block.lon);
    block.addressOptions = [];
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

  openMaps(block: LocationBlock) {
    if (!this.guestCanEdit) return;
    if (block.lat && block.lon) {
      window.open(
        `https://www.openstreetmap.org/?mlat=${block.lat}&mlon=${block.lon}#map=16/${block.lat}/${block.lon}`,
        '_blank'
      );
    }
  }

  private generateMapUrl(lat: number, lon: number): SafeResourceUrl {
    const offset = 0.003;
    const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=hot&marker=${lat},${lon}`
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
    rb.recurrenceEndDate = date ? date.getTime() : null;
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
        if (rb.date) {
          const d = new Date(rb.date);
          d.setHours(parseInt(rb.hour ?? '12', 10));
          d.setMinutes(parseInt(rb.minute ?? '00', 10));
          d.setSeconds(0); d.setMilliseconds(0);
          // Preserva lo status esistente (es. 'sent', 'completed'): solo onReminderChange lo resetta a 'pending'
          const status: 'pending' | 'sent' | 'completed' | null = rb.status ?? 'pending';
          return { type: 'reminder' as const, time: d.getTime(), recurrence: rb.recurrence ?? 'none',
            recurrenceEndDate: rb.recurrenceEndDate ?? null, status,
            evaded: rb._evaded ?? false, wasOverdue: rb._wasOverdue ?? false };
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
    const payload: any = {
      ...this.note,
      blocks,
      tags: this.note.tags ?? [],
      reminderTime: reminder?.time ?? null,
      reminderStatus: reminder?.status ?? null,
      recurrence: reminder?.recurrence ?? 'none',
      reminderRepeat: repeatValue,
      recurrenceEndDate: reminder?.recurrenceEndDate ?? null,
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
      console.error('[AutoSave] updateNote error:', err);
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
          this.closeEditor.emit(this.note?.blocks?.some(b => b.type === 'reminder') ?? false);
          return;
        }
      } catch { /* errore di rete: procedi con il save */ }
      await this.performAutoSave();
    }
    this.closeEditor.emit(this.note?.blocks?.some(b => b.type === 'reminder') ?? false);
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
      if (this.note.myRole === 'guest') {
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
      console.log('[watchNote] error — code:', err?.code, 'role:', this.note.myRole, 'noteId:', this.savedNoteId);
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
  }

  /** Kick-out handler condiviso tra data-path (collaboratorUids / not-found) e error-path (permission-denied). */
  private _handleKickout(reason: 'removed' | 'deleted' = 'removed') {
    this.stopLiveSync();
    const title = (this.note?.title ?? '').trim();
    const keyBase = reason === 'deleted' ? 'NOTE.DELETED_BY_OWNER' : 'NOTE.REMOVED_BY_OWNER';
    const key = title ? keyBase : `${keyBase}_NO_TITLE`;
    const msg = this.translationService.instant(key, { title });
    this.ngZone.run(() => {
      this.toast.show(msg, 5000);
      this.closeEditor.emit(this.note?.blocks?.some(b => b.type === 'reminder') ?? false);
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

  /** Apre lo snooze-mute sheet (Fase 1 campanella). Disponibile solo per memo/event. */
  openSnoozeSheet() {
    if (!this.savedNoteId) return;
    if (this.note.type === 'note') return;
    this.showSnoozeSheet.set(true);
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

    console.log('[applyRemoteUpdate] applying — noteId:', this.savedNoteId,
      'remoteAt:', data['updatedAt'], 'lastSavedAt (unchanged):', this.lastSavedAt,
      'blocks count:', blocks.length);
    this.note = {
      ...this.note,
      title: data['title'] ?? this.note.title,
      blocks,
    };
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
    if (this.overdueTicker) { clearInterval(this.overdueTicker); this.overdueTicker = null; }
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
