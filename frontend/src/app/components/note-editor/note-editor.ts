import { Component, Input, Output, EventEmitter, inject, OnInit, OnChanges, SimpleChanges, ViewChild, ElementRef } from '@angular/core';
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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { NoteService, Note } from '../../services/note';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatAutocompleteModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss']
})
export class NoteEditorComponent implements OnInit, OnChanges {
  @Input() selectedNote: Note | null = null;
  @Output() closeEditor = new EventEmitter<void>();

  note: Partial<Note> = {
    title: '',
    content: '',
    address: '',
    lat: undefined,
    checklist: [],
    lon: undefined,
    reminderTime: null,
    color: 'default'
  };

  isBold = false;
  isItalic = false;
  isList = false;

  reminderDate: Date | null = null;
  reminderTimeStr: string = '';
  
  activeSection: 'location' | 'reminder' | 'checklist' | null = null;
  newChecklistItemText = '';
  addressOptions: any[] = [];
  addressSearchTimeout: any;
  mapIframeUrl: SafeResourceUrl | null = null;
  addressSearchQuery = '';
  isEditingAddress = false;
  
  private noteService = inject(NoteService);
  private snackBar = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('editor', { static: true }) editorRef!: ElementRef;

  ngOnInit() {
    this.initNote();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['selectedNote']) {
      this.initNote();
    }
  }

  initNote() {
    this.activeSection = null;
    this.addressOptions = [];
    this.mapIframeUrl = null;
    this.addressSearchQuery = '';
    this.isEditingAddress = false;

    if (this.selectedNote) {
      this.note = { ...this.selectedNote };
      if (this.note.reminderTime) {
         const d = new Date(this.note.reminderTime);
         this.reminderDate = d;
         const hours = d.getHours().toString().padStart(2, '0');
         const minutes = d.getMinutes().toString().padStart(2, '0');
         this.reminderTimeStr = `${hours}:${minutes}`;
      } else {
         this.reminderDate = null;
         this.reminderTimeStr = '';
      }
      if (this.note.lat && this.note.lon) {
        this.generateMapUrl(this.note.lat, this.note.lon);
      }
    } else {
      this.note = { title: '', content: '', address: '', lat: undefined, lon: undefined, checklist: [], reminderTime: null, color: 'default' };
      this.reminderDate = null;
      this.reminderTimeStr = '';
    }
    
    if (this.editorRef) {
      this.editorRef.nativeElement.innerHTML = this.note.content || '';
    }
  }

  toggleSection(section: 'location' | 'reminder' | 'checklist') {
    if (this.activeSection === section) {
      this.activeSection = null;
    } else {
      this.activeSection = section;
      if (section === 'reminder' && !this.reminderDate) {
         const now = new Date();
         this.reminderDate = now;
         const hours = now.getHours().toString().padStart(2, '0');
         const minutes = now.getMinutes().toString().padStart(2, '0');
         this.reminderTimeStr = `${hours}:${minutes}`;
      }
    }
  }

  updateFormatState() {
    if (typeof document !== 'undefined') {
      this.isBold = document.queryCommandState('bold');
      this.isItalic = document.queryCommandState('italic');
      this.isList = document.queryCommandState('insertUnorderedList');
    }
  }

  execCommand(command: string) {
    document.execCommand(command, false, '');
    this.updateFormatState();
  }

  displayAddress(option: any): string {
    return option && option.display_name ? option.display_name : '';
  }

  onAddressInput(event: any) {
    const val = event.target.value;
    clearTimeout(this.addressSearchTimeout);
    
    if (!val || val.length < 3) {
      this.addressOptions = [];
      return;
    }

    this.addressSearchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(val)}&limit=5`);
        this.addressOptions = await res.json();
      } catch(e) {
        console.error('Error fetching address data', e);
      }
    }, 600);
  }

  selectAddress(option: any) {
    this.note.address = option.display_name;
    this.note.lat = parseFloat(option.lat);
    this.note.lon = parseFloat(option.lon);
    this.addressSearchQuery = '';
    this.isEditingAddress = false;
    this.generateMapUrl(this.note.lat, this.note.lon);
  }

  removeAddress() {
    this.note.address = '';
    this.note.lat = undefined;
    this.note.lon = undefined;
    this.mapIframeUrl = null;
    this.addressSearchQuery = '';
    this.isEditingAddress = true;
  }

  generateMapUrl(lat: number, lon: number) {
    const offset = 0.003;
    const bbox = `${lon - offset},${lat - offset},${lon + offset},${lat + offset}`;
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=hot&marker=${lat},${lon}`;
    this.mapIframeUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  addChecklistItem() {
    if (this.newChecklistItemText.trim()) {
      if (!this.note.checklist) this.note.checklist = [];
      this.note.checklist.push({ text: this.newChecklistItemText.trim(), done: false });
      this.newChecklistItemText = '';
    }
  }

  removeChecklistItem(index: number) {
    this.note.checklist?.splice(index, 1);
  }

  clearReminder() {
    this.reminderDate = null;
    this.reminderTimeStr = '';
    this.note.reminderTime = null;
  }

  openMaps() {
    if (this.note.lat && this.note.lon) {
      window.open(`https://www.openstreetmap.org/?mlat=${this.note.lat}&mlon=${this.note.lon}#map=16/${this.note.lat}/${this.note.lon}`, '_blank');
    } else if (this.note.address) {
      window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(this.note.address)}`, '_blank');
    }
  }

  async save() {
    try {
      this.note.content = this.editorRef.nativeElement.innerHTML;
      if (this.reminderDate && this.reminderTimeStr) {
        const [hours, minutes] = this.reminderTimeStr.split(':').map(Number);
        const d = new Date(this.reminderDate);
        d.setHours(hours || 0);
        d.setMinutes(minutes || 0);
        d.setSeconds(0);
        d.setMilliseconds(0);
        this.note.reminderTime = d.getTime();
      } else if (this.reminderDate) {
        const d = new Date(this.reminderDate);
        d.setHours(12);
        d.setMinutes(0);
        this.note.reminderTime = d.getTime();
      } else {
        this.note.reminderTime = null;
      }

      const payload: any = { ...this.note };
      // Firebase non accetta undefined, li impostiamo a null così che vengano ripuliti se eliminati
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          payload[key] = null;
        }
      });

      if (this.selectedNote?.id) {
        await this.noteService.updateNote(this.selectedNote.id, payload);
      } else {
        await this.noteService.createNote(payload);
      }
      this.closeEditor.emit();
    } catch (e: any) {
      console.error(e);
      let errMsg = e.message;
      if (e.message?.includes('Missing or insufficient permissions')) {
        errMsg = "Permessi Negati! Firebase Security Rules è in 'Locked Mode'. Abilita le modifiche in console Firebase -> Firestore -> Regole.";
      }
      this.snackBar.open("Errore Firebase: " + errMsg, "Chiudi", {duration: 8000});
    }
  }

  async deleteNote() {
    try {
      if (this.selectedNote?.id) {
        await this.noteService.deleteNote(this.selectedNote.id);
        this.closeEditor.emit();
      }
    } catch (e: any) {
        this.snackBar.open("Errore eliminazione: " + e.message, "Chiudi", {duration: 5000});
    }
  }
}
