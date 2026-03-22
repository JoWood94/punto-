import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService, Note } from '../../services/note';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { Observable } from 'rxjs';
import { PushNotificationService } from '../../services/push-notification';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    MatToolbarModule, 
    MatIconModule, 
    MatButtonModule, 
    MatCardModule, 
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    NoteEditorComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  private authService = inject(AuthService);
  private noteService = inject(NoteService);
  private router = inject(Router);
  private pushService = inject(PushNotificationService);
  private breakpointObserver = inject(BreakpointObserver);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];
  
  activeNote?: Note | null = undefined;
  isMobile = false;

  async ngOnInit() {
    this.notes$ = this.noteService.getNotes();
    
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile = result.matches;
    });

    // Push notifications: non-blocking, fail gracefully
    this.pushService.requestPermission().then(() => {
      this.pushService.listenForMessages();
    }).catch(() => {
      console.warn('Push notifications non disponibili in questo browser.');
    });
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  openNoteEditor() {
    this.activeNote = null;
  }

  selectNote(note: Note) {
    this.activeNote = note;
  }

  closeEditor() {
    this.activeNote = undefined;
  }

  changeThemeColor(color: string) {
    document.documentElement.style.setProperty('--mdc-theme-primary', color);
  }
}
