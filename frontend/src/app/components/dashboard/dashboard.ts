import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { Observable, Subscription } from 'rxjs';
import { PushNotificationService } from '../../services/push-notification';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatCardModule,
    MatMenuModule,
    MatSidenavModule,
    MatListModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonToggleModule,
    NoteEditorComponent,
    CalendarViewComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  private breakpointObserver = inject(BreakpointObserver);
  private snackBar = inject(MatSnackBar);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  activeNote?: Note | null = undefined;
  isMobile = false;
  currentMainView: 'list' | 'calendar' = 'list';

  /** Tutte le note ricevute dallo stream Firestore */
  allNotes: Note[] = [];
  /** Note filtrate e ordinate, usate nel template */
  filteredNotes: Note[] = [];
  /** Query di ricerca digitata dall'utente */
  searchQuery = '';

  private notesSub?: Subscription;

  constructor(
    private noteService: NoteService,
    private pushService: PushNotificationService
  ) {}

  async ngOnInit() {
    // Synchronous initial check to avoid NG0100
    this.isMobile = this.breakpointObserver.isMatched([Breakpoints.Handset]);
    this.checkMobile();
    
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

    // Sottoscrizione locale per mantenere allNotes aggiornato e applicare filtri/ordinamento
    this.notesSub = this.notes$.subscribe(notes => {
      this.allNotes = notes;
      this.applyFilter();
    });

    // Push notifications: non-blocking, fail gracefully
    this.pushService.requestPermission().then(() => {
      this.pushService.listenForMessages();
    }).catch(() => {
      console.warn('Push notifications non disponibili in questo browser.');
    });
  }

  private checkMobile() {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      // Use microtask to ensure change detection has finished if this happens mid-cycle
      Promise.resolve().then(() => {
        this.isMobile = result.matches;
      });
    });
  }

  ngOnDestroy() {
    this.notesSub?.unsubscribe();
  }

  /**
   * Filtra le note per titolo o contenuto (testo plain, senza HTML)
   * e le ordina per data di creazione discendente (più recente prima).
   */
  applyFilter() {
    const q = this.searchQuery.trim().toLowerCase();
    let result = this.allNotes;

    if (q) {
      result = result.filter(note => {
        const titleMatch = (note.title || '').toLowerCase().includes(q);
        // Rimuove i tag HTML per cercare nel contenuto plain
        const plainContent = (note.content || '').replace(/<[^>]*>/g, ' ').toLowerCase();
        const contentMatch = plainContent.includes(q);
        return titleMatch || contentMatch;
      });
    }

    // Ordina per createdAt discendente (più recente prima)
    result = [...result].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

    this.filteredNotes = result;
  }

  onSearchChange() {
    this.applyFilter();
  }

  clearSearch() {
    this.searchQuery = '';
    this.applyFilter();
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

  handleBackButton() {
    if (this.activeNote !== undefined) {
      this.activeNote = undefined;
    } else {
      this.currentMainView = 'list';
    }
  }

  onCalendarNoteSelected(note: Note) {
    this.activeNote = note;
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
