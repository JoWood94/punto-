import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService, Note } from '../../services/note';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { Observable } from 'rxjs';
import { PushNotificationService } from '../../services/push-notification';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    MatToolbarModule, 
    MatIconModule, 
    MatButtonModule, 
    MatCardModule, 
    MatDialogModule,
    MatMenuModule
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private noteService = inject(NoteService);
  private router = inject(Router);
  private dialog = inject(MatDialog);
  private pushService = inject(PushNotificationService);

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  async ngOnInit() {
    this.notes$ = this.noteService.getNotes();
    await this.pushService.requestPermission();
    this.pushService.listenForMessages();
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  openNoteEditor(note?: Note) {
    this.dialog.open(NoteEditorComponent, {
      width: '95vw',
      maxWidth: '600px',
      data: { note },
      panelClass: 'note-dialog-container'
    });
  }

  changeThemeColor(color: string) {
    // In un setup Material 3 completo useremmo theme helper, per ora modifichiamo variabili root.
    document.documentElement.style.setProperty('--mdc-theme-primary', color);
  }
}
