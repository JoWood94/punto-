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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { Observable, Subscription, firstValueFrom } from 'rxjs';
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
  private breakpointObserver = inject(BreakpointObserver);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  @ViewChild('sidenav') sidenav!: MatSidenav;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  activeNote?: Note | null = undefined;
  isMobile = false;
  currentMainView: 'list' | 'calendar' = 'list';

  allNotes: Note[] = [];
  filteredNotes: Note[] = [];
  searchQuery = '';

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
  }

  private checkMobile() {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      Promise.resolve().then(() => { this.isMobile = result.matches; });
    });
  }

  ngOnDestroy() { this.notesSub?.unsubscribe(); }

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
  selectNote(note: Note) { this.activeNote = note; }
  closeEditor() { this.activeNote = undefined; }
  handleBackButton() {
    if (this.activeNote !== undefined) this.activeNote = undefined;
    else this.currentMainView = 'list';
  }
  onCalendarNoteSelected(note: Note) { this.activeNote = note; }

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
