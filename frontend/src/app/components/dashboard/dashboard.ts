import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService, Note, getNotePreview, getChecklistProgress } from '../../services/note';
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
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
import { Location } from '@angular/common';
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
    MatDialogModule,
    MatChipsModule,
    NoteEditorComponent,
    CalendarViewComponent
  ],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  private location: Location = inject(Location);
  private breakpointObserver = inject(BreakpointObserver);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  activeNote?: Note | null = undefined;
  isMobile = false;
  currentMainView: 'list' | 'calendar' = 'calendar';
  private defaultViewKey = 'defaultView';

  allNotes: Note[] = [];
  filteredNotes: Note[] = [];
  searchQuery = '';
  newNoteCalendarDate: Date | undefined = undefined;

  // TODO: tags disabilitati temporaneamente
  // allTags: string[] = [];
  // selectedTags: string[] = [];

  private notesSub?: Subscription;

  constructor(
    private noteService: NoteService,
    private pushService: PushNotificationService
  ) {}

  async ngOnInit() {
    this.isMobile = this.breakpointObserver.isMatched([Breakpoints.Handset]);
    this.checkMobile();

    // Carica preferenza vista di default (solo mobile)
    if (this.isMobile) {
      this.currentMainView = await this.noteService.getUserPreference<'list' | 'calendar'>(this.defaultViewKey, 'list');
    }

    if (window.visualViewport) {
      const vv = window.visualViewport;
      const setVh = () => {
        document.documentElement.style.setProperty('--vh', `${vv.height}px`);
        if (vv.offsetTop > 0) window.scrollTo(0, 0);
      };
      vv.addEventListener('resize', setVh);
      vv.addEventListener('scroll', setVh);
      setVh();
    }

    this.notes$ = this.noteService.getNotes();

    this.notesSub = this.notes$.subscribe(notes => {
      this.allNotes = notes;
      // this.updateAllTags(); // TODO: tags disabilitati temporaneamente
      this.applyFilter();
    });

    this.pushService.requestPermission().then(() => {
      this.pushService.listenForMessages();
    }).catch(() => {
      console.warn('Push notifications non disponibili in questo browser.');
    });

    // Gestione back gesture mobile
    window.history.pushState({ punto: 'dashboard' }, '', window.location.href);
    window.addEventListener('popstate', this.onMobilePopState);
  }

  private checkMobile() {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      Promise.resolve().then(() => { this.isMobile = result.matches; });
    });
  }

  ngOnDestroy() {
    this.notesSub?.unsubscribe();
    window.removeEventListener('popstate', this.onMobilePopState);
  }

  // TODO: tags disabilitati temporaneamente
  // private updateAllTags() { ... }
  // toggleTagFilter(tag: string) { ... }
  // isTagSelected(tag: string): boolean { ... }
  // clearTagFilters() { ... }

  // ─── Filtering & Sorting ────────────────────────────────────────────────────

  applyFilter() {
    const q = this.searchQuery.trim().toLowerCase();
    let result = this.allNotes;

    // Text search (title + content)
    if (q) {
      result = result.filter(note => {
        const titleMatch = (note.title || '').toLowerCase().includes(q);
        const plain = getNotePreview(note).toLowerCase();
        return titleMatch || plain.includes(q);
      });
    }

    // TODO: tag filter disabilitato temporaneamente
    // if (this.selectedTags.length > 0) { ... }

    // Sort: pinned first, then by createdAt descending
    result = [...result].sort((a, b) => {
      const pinDiff = (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });

    this.filteredNotes = result;
  }

  onSearchChange() { this.applyFilter(); }
  clearSearch() { this.searchQuery = ''; this.applyFilter(); }

  // ─── Note preview helpers (used in template) ────────────────────────────────

  getNotePreview(note: Note): string { return getNotePreview(note); }

  getChecklistProgress(note: Note): { done: number; total: number } | null {
    return getChecklistProgress(note);
  }

  // ─── Pin ────────────────────────────────────────────────────────────────────

  async togglePin(note: Note, event: Event) {
    event.stopPropagation();
    if (!note.id) return;
    try {
      await this.noteService.updateNote(note.id, { pinned: !note.pinned });
    } catch (e: any) {
      this.snackBar.open('Errore: ' + e.message, 'Chiudi', { duration: 3000 });
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  logout() { this.authService.logout().then(() => this.router.navigate(['/login'])); }
  openNoteEditor() { this.activeNote = null; }
  openNoteEditorFromCalendar(date?: Date) {
    const now = new Date();
    // Usa la data passata (dal calendario settimana/mese) oppure oggi
    const target = date ?? new Date();
    target.setHours(now.getHours(), now.getMinutes(), 0, 0);
    this.newNoteCalendarDate = target;
    this.activeNote = null;
  }
  selectNote(note: Note) { this.activeNote = note; }
  closeEditor() { this.activeNote = undefined; this.newNoteCalendarDate = undefined; }
  handleBackButton() {
    if (this.activeNote !== undefined) this.activeNote = undefined;
    else this.currentMainView = 'list';
  }
  onCalendarNoteSelected(note: Note) { this.activeNote = note; }

  async setDefaultView(view: 'list' | 'calendar') {
    this.currentMainView = view;
    if (this.isMobile) {
      await this.noteService.setUserPreference(this.defaultViewKey, view);
    }
  }

  private onMobilePopState = (_event: PopStateEvent) => {
    // Spingi subito uno stato per rimanere sull'URL attuale (no navigazione browser)
    window.history.pushState({ punto: 'dashboard' }, '', window.location.href);
    // Gestisci la navigazione in-app
    if (this.isMobile) {
      this.handleBackButton();
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async deleteNote(note: Note, event: Event) {
    event.stopPropagation();
    if (!note.id) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Elimina nota',
        message: `Vuoi eliminare "${note.title || 'Nuova Nota'}"? L'operazione non è reversibile.`,
        confirmLabel: 'Elimina'
      }
    });
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;
    try {
      await this.noteService.deleteNote(note.id);
      if (this.activeNote?.id === note.id) this.activeNote = undefined;
      this.snackBar.open('Nota eliminata', 'Chiudi', { duration: 3000 });
    } catch (e: any) {
      this.snackBar.open('Errore eliminazione: ' + e.message, 'Chiudi', { duration: 5000 });
    }
  }

  changeThemeColor(color: string) {
    document.documentElement.style.setProperty('--mdc-theme-primary', color);
  }
}
