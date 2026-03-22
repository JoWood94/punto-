import { Component, Inject, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule, MatChipInputEvent } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ENTER, COMMA } from '@angular/cdk/keycodes';
import { NoteService, Note } from '../../services/note';

@Component({
  selector: 'app-note-editor',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    MatDialogModule, 
    MatFormFieldModule, 
    MatInputModule, 
    MatButtonModule, 
    MatIconModule,
    MatChipsModule,
    MatTooltipModule
  ],
  templateUrl: './note-editor.html',
  styleUrls: ['./note-editor.scss']
})
export class NoteEditorComponent implements OnInit {
  note: Partial<Note> = {
    title: '',
    content: '',
    tags: [],
    address: '',
    reminderTime: null,
    color: 'default'
  };

  separatorKeysCodes: number[] = [ENTER, COMMA];
  reminderDateStr: string = '';
  
  private noteService = inject(NoteService);

  @ViewChild('editor', { static: true }) editorRef!: ElementRef;

  constructor(
    public dialogRef: MatDialogRef<NoteEditorComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { note?: Note }
  ) {
    if (data.note) {
      this.note = { ...data.note };
      if (this.note.reminderTime) {
         const d = new Date(this.note.reminderTime);
         this.reminderDateStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      }
    }
  }

  ngOnInit() {
    this.editorRef.nativeElement.innerHTML = this.note.content || '';
  }

  addTag(event: MatChipInputEvent): void {
    const value = (event.value || '').trim();
    if (value) {
      if(!this.note.tags) this.note.tags = [];
      this.note.tags.push(value);
    }
    event.chipInput!.clear();
  }

  removeTag(tag: string): void {
    const index = this.note.tags?.indexOf(tag) ?? -1;
    if (index >= 0) {
      this.note.tags?.splice(index, 1);
    }
  }

  execCommand(command: string) {
    document.execCommand(command, false, '');
    this.editorRef.nativeElement.focus();
  }

  openMaps() {
    if (this.note.address) {
      window.open(`https://www.openstreetmap.org/search?query=${encodeURIComponent(this.note.address)}`, '_blank');
    }
  }

  async save() {
    // estrae l'html formattato per il rich text editor builtin
    this.note.content = this.editorRef.nativeElement.innerHTML;
    if (this.reminderDateStr) {
      this.note.reminderTime = new Date(this.reminderDateStr).getTime();
    } else {
      this.note.reminderTime = null;
    }

    if (this.data.note?.id) {
      await this.noteService.updateNote(this.data.note.id, this.note);
    } else {
      await this.noteService.createNote(this.note);
    }
    this.dialogRef.close();
  }

  async deleteNote() {
    if (this.data.note?.id) {
      await this.noteService.deleteNote(this.data.note.id);
      this.dialogRef.close();
    }
  }
}
