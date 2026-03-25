import {
  Component, Input, Output, EventEmitter, inject, OnInit, OnChanges,
  SimpleChanges, ViewChildren, QueryList, ElementRef, ChangeDetectorRef, AfterViewChecked
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
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { LinkDialogComponent } from '../link-dialog/link-dialog';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatTooltipModule, MatSnackBarModule, MatAutocompleteModule,
    MatCheckboxModule, MatDatepickerModule, MatNativeDateModule,
    MatSelectModule, MatChipsModule, MatMenuModule, MatDialogModule,
    DragDropModule
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss']
})
export class NoteEditorComponent implements OnInit, OnChanges, AfterViewChecked {
  @Input() selectedNote: Note | null = null;
  @Output() closeEditor = new EventEmitter<void>();

  /** Collects only #textBlockEl refs (one per text block, in ngFor order). */
  @ViewChildren('textBlockEl') textBlockEls!: QueryList<ElementRef<HTMLElement>>;

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

  uploadProgress = new Map<number, number>(); // blockIndex → upload %

  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(MatDialog);

  /** Set to true whenever the blocks array changes and text blocks need HTML re-init. */
  private textBlocksNeedInit = false;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit() { this.initNote(); }
  ngOnChanges(changes: SimpleChanges) { if (changes['selectedNote']) this.initNote(); }

  ngAfterViewChecked() {
    if (this.textBlocksNeedInit) {
      this.textBlocksNeedInit = false;
      this.initTextBlockElements();
    }
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
      this.note = {
        title: '',
        blocks: [{ type: 'text', html: '' }],
        tags: [],
        color: 'default'
      };
    }
    this.textBlocksNeedInit = true;
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
    const insertAt = afterIndex !== undefined ? afterIndex + 1 : this.note.blocks.length;
    this.note.blocks = [
      ...this.note.blocks.slice(0, insertAt),
      newBlock,
      ...this.note.blocks.slice(insertAt)
    ];
    this.textBlocksNeedInit = true;
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
    if (this.note.blocks.length <= 1) return;
    this.saveTextBlocksFromDOM();
    if (this.activeTextBlockIndex === index) this.activeTextBlockIndex = null;
    this.note.blocks = this.note.blocks.filter((_, i) => i !== index);
    this.textBlocksNeedInit = true;
  }

  canRemoveBlock(index: number): boolean {
    return this.note.blocks.length > 1;
  }

  onBlockDrop(event: CdkDragDrop<NoteBlock[]>) {
    this.saveTextBlocksFromDOM();
    const blocks = [...this.note.blocks];
    moveItemInArray(blocks, event.previousIndex, event.currentIndex);
    this.note.blocks = blocks;
    this.textBlocksNeedInit = true;
  }

  // ─── Text Block ─────────────────────────────────────────────────────────────

  onTextInput(blockIndex: number, event: Event) {
    (this.note.blocks[blockIndex] as TextBlock).html = (event.target as HTMLElement).innerHTML;
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
    if (text.trim()) block.items.push({ text: text.trim(), done: false });
  }

  removeChecklistItem(block: ChecklistBlock, index: number) {
    block.items.splice(index, 1);
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
  }

  clearLocation(block: any) {
    block.address = '';
    block.lat = undefined;
    block.lon = undefined;
    block.mapUrl = undefined;
    block.editing = true;
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
  }

  // ─── Image Block ────────────────────────────────────────────────────────────

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
        this.snackBar.open('Errore upload: ' + err.message, 'Chiudi', { duration: 5000 });
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
      } catch { /* already deleted or not found */ }
    }
    block.url = '';
    block.storagePath = '';
  }

  // TODO: tags disabilitati temporaneamente
  // addTag() { ... }
  // removeTag(tag: string) { ... }

  // ─── Save / Delete ──────────────────────────────────────────────────────────

  async save() {
    try {
      this.saveTextBlocksFromDOM();

      // Serialize blocks: strip runtime-only UI state, compute reminder time
      const blocks: NoteBlock[] = this.note.blocks.map(block => {
        if (block.type === 'reminder') {
          const rb = block as any;
          if (rb.date) {
            const d = new Date(rb.date);
            d.setHours(parseInt(rb.hour ?? '12', 10));
            d.setMinutes(parseInt(rb.minute ?? '00', 10));
            d.setSeconds(0); d.setMilliseconds(0);
            return {
              type: 'reminder' as const,
              time: d.getTime(),
              recurrence: rb.recurrence ?? 'none',
              status: 'pending' as const
            };
          }
          return { type: 'reminder' as const, time: null, recurrence: rb.recurrence ?? 'none', status: null };
        }
        if (block.type === 'location') {
          const lb = block as any;
          return { type: 'location' as const, address: lb.address ?? '', lat: lb.lat, lon: lb.lon };
        }
        return block;
      });

      // Derive legacy flat fields for backward compat (server queries these)
      const reminder = blocks.find(b => b.type === 'reminder') as ReminderBlock | undefined;
      const textHtml = (blocks.filter(b => b.type === 'text') as TextBlock[]).map(b => b.html).join('');

      const payload: any = {
        ...this.note,
        blocks,
        tags: this.note.tags ?? [],
        // Legacy
        content: textHtml,
        reminderTime: reminder?.time ?? null,
        reminderStatus: reminder?.status ?? null,
        recurrence: reminder?.recurrence ?? 'none',
      };

      // Remove fields that are now in blocks only
      delete payload.address; delete payload.lat; delete payload.lon; delete payload.checklist;

      // Firebase doesn't accept undefined values
      Object.keys(payload).forEach(k => { if (payload[k] === undefined) payload[k] = null; });

      if (this.selectedNote?.id) {
        await this.noteService.updateNote(this.selectedNote.id, payload);
      } else {
        await this.noteService.createNote(payload);
      }
      this.closeEditor.emit();
    } catch (e: any) {
      let msg = e?.message ?? 'Errore sconosciuto';
      if (msg.includes('Missing or insufficient permissions')) {
        msg = 'Permessi Negati! Abilita le modifiche in Firebase Console.';
      }
      this.snackBar.open('Errore: ' + msg, 'Chiudi', { duration: 10000, panelClass: ['error-snackbar'] });
    }
  }

  async confirmDelete() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina nota',
        message: `Vuoi eliminare "${this.selectedNote?.title || 'questa nota'}"? L'operazione non è reversibile.`,
        confirmLabel: 'Elimina'
      }
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (confirmed && this.selectedNote?.id) {
      await this.noteService.deleteNote(this.selectedNote.id);
      this.closeEditor.emit();
    }
  }
}
