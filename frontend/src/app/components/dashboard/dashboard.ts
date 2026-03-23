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
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
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
    MatTooltipModule,
    MatSnackBarModule,
    NoteEditorComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  private breakpointObserver = inject(BreakpointObserver);
  private snackBar = inject(MatSnackBar);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];
  
  activeNote?: Note | null = undefined;
  isMobile = false;

  constructor(
    private noteService: NoteService,
    private pushService: PushNotificationService
  ) {}

  async ngOnInit() {
    this.checkMobile();
    window.addEventListener('resize', () => this.checkMobile());
    
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const setVh = () => {
        document.documentElement.style.setProperty('--vh', `${vv.height}px`);
        // Se il viewport è traslato (es. scrollato dalla tastiera), riportalo a zero
        if (vv.offsetTop > 0) {
          window.scrollTo(0, 0);
        }
      };
      vv.addEventListener('resize', setVh);
      vv.addEventListener('scroll', setVh);
      setVh();
    }

    this.notes$ = this.noteService.getNotes();
    
    // Push notifications: non-blocking, fail gracefully
    this.pushService.requestPermission().then(() => {
      this.pushService.listenForMessages();
    }).catch(() => {
      console.warn('Push notifications non disponibili in questo browser.');
    });
  }

  private checkMobile() {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  logout() {
    this.authService.logout().then(() => {
      this.router.navigate(['/login']);
    });
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

  async deleteNote(note: Note, event: Event) {
    event.stopPropagation();
    if (!note.id) return;
    try {
      await this.noteService.deleteNote(note.id);
      if (this.activeNote?.id === note.id) {
        this.activeNote = undefined;
      }
      this.snackBar.open('Nota eliminata', 'Chiudi', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open('Errore eliminazione: ' + e.message, 'Chiudi', { duration: 5000 });
    }
  }

  changeThemeColor(color: string) {
    document.documentElement.style.setProperty('--mdc-theme-primary', color);
  }
}
