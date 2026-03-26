import {
  Component, Input, Output, EventEmitter, inject, OnInit, OnChanges, OnDestroy,
  SimpleChanges, ViewChildren, ViewChild, QueryList, ElementRef, ChangeDetectorRef, AfterViewChecked
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
  NoteService, Note, NoteBlock, TextBlock, ChecklistBlock,
  LocationBlock, ReminderBlock, ImageBlock, LinkBlock, migrateToBlocks
} from '../../services/note';
import { AuthService } from '../../services/auth';
import { LinkDialogComponent } from '../link-dialog/link-dialog';
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
    DragDropModule
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss']
})
export class NoteEditorComponent implements OnInit, OnChanges, AfterViewChecked, OnDestroy {
  @Input() selectedNote: Note | null = null;
  @Input() initialReminderDate?: Date;
  @Output() closeEditor = new EventEmitter<void>();

  /** Collects only #textBlockEl refs (one per text block, in ngFor order). */
  @ViewChildren('textBlockEl') textBlockEls!: QueryList<ElementRef<HTMLElement>>;
  @ViewChild('editorContent') editorContent!: ElementRef<HTMLElement>;

  note: Partial<Note> & { blocks: NoteBlock[]; tags: string[] } = {
    title: '',
    blocks: [{ type: 'text', html: '' }],
    tags: [],
    color: 'default'
  };

  // Rich-text formatting state (reflects the active text block)
  isBold = false;
  isItalic = false;
  isList = false;
  activeTextBlockIndex: number | null = null;

  // TODO: tags disabilitati temporaneamente
  // tagInput = '';

  hoursList = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  // TODO: uploadProgress riabilitare con piano Firebase Storage
  // uploadProgress = new Map<number, number>(); // blockIndex → upload %

  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);

  /** Set to true whenever the blocks array changes and text blocks need HTML re-init. */
  private textBlocksNeedInit = false;
  /** Block index to focus after next DOM init (used to open keyboard on new text block). */
  private pendingFocusBlockIndex: number | null = null;

  private readonly PLACEHOLDER_TITLE = 'Nuova Nota';
  private savedNoteId: string | null = null;
  private isNewNote = false;
  private autoSaveTimer: any;
  private createNotePromise: Promise<void> | null = null;
  private userHasModifiedContent = false;

  get hasReminderBlock(): boolean {
    return this.note.blocks.some(b => b.type === 'reminder');
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() { this.initNote(); }
  ngOnChanges(changes: SimpleChanges) { if (changes['selectedNote']) this.initNote(); }

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
    let textIdx = 0;
    this.note.blocks.forEach(block => {
      if (block.type === 'text') {
        if (els[textIdx]) {
          els[textIdx].nativeElement.innerHTML = (block as TextBlock).html || '';
        }
        textIdx++;
      }
    });
  }

  private initNote() {
    if (this.selectedNote) {
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
            rb.minute = (Math.round(d.getMinutes() / 5) * 5 % 60).toString().padStart(2, '0');
          } else {
            const now = new Date();
            now.setMinutes(Math.round(now.getMinutes() / 5) * 5, 0, 0);
            rb.date = now;
            rb.hour = now.getHours().toString().padStart(2, '0');
            rb.minute = now.getMinutes().toString().padStart(2, '0');
          }
        }
      });
      this.note = {
        ...this.selectedNote,
        blocks,
        tags: this.selectedNote.tags ? [...this.selectedNote.tags] : []
      };
    } else {
      // Guard: ngOnInit + ngOnChanges chiamano entrambi initNote() al mount — evita doppia creazione
      if (this.isNewNote) return;

      this.userHasModifiedContent = false;
      if (this.initialReminderDate) {
        // Da calendario: solo blocco reminder, nessun testo di default
        const d = this.initialReminderDate;
        const reminderBlock: any = {
          type: 'reminder', time: null, recurrence: 'none', status: null,
          date: d,
          hour: d.getHours().toString().padStart(2, '0'),
          minute: (Math.round(d.getMinutes() / 5) * 5 % 60).toString().padStart(2, '0')
        };
        this.note = { title: this.PLACEHOLDER_TITLE, blocks: [reminderBlock], tags: [], color: 'default' };
      } else {
        this.note = { title: this.PLACEHOLDER_TITLE, blocks: [{ type: 'text', html: '' }], tags: [], color: 'default' };
      }
      this.isNewNote = true;
      this.savedNoteId = null;
      // Crea subito su Firestore per avere un ID
      this.createNotePromise = this.noteService.createNote(this.buildPayload())
        .then(result => { this.savedNoteId = result.id; })
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
        const now = new Date();
        now.setMinutes(Math.round(now.getMinutes() / 5) * 5, 0, 0);
        newBlock = {
          type: 'reminder', time: null, recurrence: 'none', status: null,
          date: now,
          hour: now.getHours().toString().padStart(2, '0'),
          minute: now.getMinutes().toString().padStart(2, '0')
        } as any;
        break;
      }
      case 'image':
        newBlock = { type: 'image', url: '', storagePath: '' } as ImageBlock;
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
    this.scrollEditorToBottom();
    this.triggerAutoSave();
  }

  addBlockAfterActive(type: NoteBlock['type']) {
    const insertAfter = this.activeTextBlockIndex ?? this.note.blocks.length - 1;
    this.addBlock(type, insertAfter);
  }

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
    const insertAt = (this.activeTextBlockIndex ?? this.note.blocks.length - 1) + 1;
    const newBlock: LinkBlock = { type: 'link', url: result.url, label: result.label };
    this.note.blocks = [
      ...this.note.blocks.slice(0, insertAt),
      newBlock,
      ...this.note.blocks.slice(insertAt)
    ];
    this.textBlocksNeedInit = true;
    this.scrollEditorToBottom();
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
    const block = this.note.blocks[index];
    // Il blocco testo è l'unico non rimovibile se è rimasto il solo blocco
    if (block.type === 'text' && this.note.blocks.length <= 1) return;
    this.saveTextBlocksFromDOM();
    if (this.activeTextBlockIndex === index) this.activeTextBlockIndex = null;
    this.note.blocks = this.note.blocks.filter((_, i) => i !== index);
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  canRemoveBlock(index: number): boolean {
    const block = this.note.blocks[index];
    // Il blocco testo non è rimovibile se è l'unico rimasto
    if (block.type === 'text' && this.note.blocks.length <= 1) return false;
    return true;
  }

  onBlockDrop(event: CdkDragDrop<NoteBlock[]>) {
    this.saveTextBlocksFromDOM();
    const blocks = [...this.note.blocks];
    moveItemInArray(blocks, event.previousIndex, event.currentIndex);
    this.note.blocks = blocks;
    this.textBlocksNeedInit = true;
    this.triggerAutoSave();
  }

  // ─── Text Block ─────────────────────────────────────────────────────────────

  onTextInput(blockIndex: number, event: Event) {
    (this.note.blocks[blockIndex] as TextBlock).html = (event.target as HTMLElement).innerHTML;
    this.triggerAutoSave();
  }

  onTextFocus(blockIndex: number) {
    this.activeTextBlockIndex = blockIndex;
    this.updateFormatState();
  }

  onTextBlur() {
    this.activeTextBlockIndex = null;
    this.cdr.detectChanges();
  }

  updateFormatState() {
    if (typeof document !== 'undefined') {
      this.isBold = document.queryCommandState('bold');
      this.isItalic = document.queryCommandState('italic');
      this.isList = document.queryCommandState('insertUnorderedList');
      this.cdr.detectChanges();
    }
  }

  execCommand(command: string) {
    if (this.activeTextBlockIndex !== null) {
      const els = this.textBlockEls.toArray();
      let textIdx = 0;
      for (let i = 0; i < this.note.blocks.length; i++) {
        if (this.note.blocks[i].type === 'text') {
          if (i === this.activeTextBlockIndex && els[textIdx]) {
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

  removeChecklistItem(block: ChecklistBlock, index: number) {
    block.items.splice(index, 1);
    this.triggerAutoSave();
  }

  onChecklistItemChange() {
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
    this.cdr.detectChanges();
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

  clearReminder(block: any) {
    block.time = null;
    block.status = null;
    block.date = undefined;
    this.triggerAutoSave();
  }

  onReminderChange() {
    // L'utente ha modificato il reminder → resetta lo status a 'pending' per ri-schedulare l'invio
    this.note.blocks.forEach(b => {
      if (b.type === 'reminder') (b as any).status = 'pending';
    });
    this.triggerAutoSave();
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
          // Preserva lo status esistente (es. 'sent'): solo onReminderChange lo resetta a 'pending'
          const status: 'pending' | 'sent' | null = rb.status ?? 'pending';
          return { type: 'reminder' as const, time: d.getTime(), recurrence: rb.recurrence ?? 'none', status };
        }
        return { type: 'reminder' as const, time: null, recurrence: rb.recurrence ?? 'none', status: null };
      }
      if (block.type === 'location') {
        const lb = block as any;
        return { type: 'location' as const, address: lb.address ?? '', lat: lb.lat, lon: lb.lon };
      }
      return block;
    });
    const reminder = blocks.find(b => b.type === 'reminder') as ReminderBlock | undefined;
    const textHtml = (blocks.filter(b => b.type === 'text') as TextBlock[]).map(b => b.html).join('');
    const payload: any = {
      ...this.note,
      blocks,
      tags: this.note.tags ?? [],
      content: textHtml,
      reminderTime: reminder?.time ?? null,
      reminderStatus: reminder?.status ?? null,
      recurrence: reminder?.recurrence ?? 'none',
    };
    delete payload.address; delete payload.lat; delete payload.lon; delete payload.checklist;
    Object.keys(payload).forEach(k => { if (payload[k] === undefined) payload[k] = null; });
    return payload;
  }

  private isPristine(): boolean {
    if (this.userHasModifiedContent) return false;
    const title = (this.note.title || '').trim();
    return !title || title === this.PLACEHOLDER_TITLE;
  }

  triggerAutoSave() {
    this.userHasModifiedContent = true;
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => this.performAutoSave(), 800);
  }

  private async performAutoSave() {
    if (!this.savedNoteId) return;
    try {
      await this.noteService.updateNote(this.savedNoteId, this.buildPayload());
    } catch (err) {
      console.error('[AutoSave] updateNote error:', err);
    }
  }

  async handleClose() {
    clearTimeout(this.autoSaveTimer);
    // Attendi che la createNote sia completata (evita note orfane se l'utente chiude troppo in fretta)
    if (this.createNotePromise) await this.createNotePromise.catch(() => {});
    if (this.isNewNote && this.savedNoteId && this.isPristine()) {
      // Nuova nota senza contenuto reale → cancella
      try { await this.noteService.deleteNote(this.savedNoteId); } catch { /* ignora */ }
    } else if (this.savedNoteId) {
      // Salva eventuali modifiche pendenti
      await this.performAutoSave();
    }
    this.closeEditor.emit();
  }

  onTitleChange() {
    this.triggerAutoSave();
  }

  ngOnDestroy() {
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
}
