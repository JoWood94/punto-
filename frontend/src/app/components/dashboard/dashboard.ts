import { Component, inject, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService, Note, getNotePreview, getChecklistProgress } from '../../services/note';
import { CryptoService } from '../../services/crypto';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenavModule, MatSidenav } from '@angular/material/sidenav';
import { MatListModule } from '@angular/material/list';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { PassphraseDialogComponent } from '../passphrase-dialog/passphrase-dialog';
import { Observable, Subscription, firstValueFrom, skip } from 'rxjs';
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
    MatInputModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
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
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private cryptoService: CryptoService = inject(CryptoService);
@ViewChild('sidenav') sidenav!: MatSidenav;
  /** Riferimento all'editor attivo — usato dalla mobile toolbar in dashboard.html */
  @ViewChild('noteEditor') noteEditorComp?: NoteEditorComponent;

  notes$: Observable<Note[]> | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  activeNote?: Note | null = undefined;
  isMobile = false;
  currentMainView: 'list' | 'calendar' =
    (localStorage.getItem('punto_defaultView') as 'list' | 'calendar') ?? 'list';
  activeListTab: 'notes' | 'evasi' = 'notes';
  isOffline = !navigator.onLine;
  hasFirestoreError = false;
  private defaultViewKey = 'defaultView';

  allNotes: Note[] = [];
  filteredNotes: Note[] = [];
  searchQuery = '';
  newNoteCalendarDate: Date | undefined = undefined;
  notesLoaded = false;

  // TODO: tags disabilitati temporaneamente
  // allTags: string[] = [];
  // selectedTags: string[] = [];

  private notesSub?: Subscription;
  private authSub?: Subscription;
  private sessionCheckInterval?: ReturnType<typeof setInterval>;
  private userDocUnsub?: () => void;
  private settingsMenuTimer?: ReturnType<typeof setTimeout>;
  settingsMenuEnabled = true;
  isReady = false;
  private deepLinkNoteId: string | null = null;
  private swMessageListener?: (event: MessageEvent) => void;
  private readonly onOnline = () => { this.isOffline = false; this.hasFirestoreError = false; };
  private readonly onOffline = () => { this.isOffline = true; };

  constructor(
    private noteService: NoteService,
    private pushService: PushNotificationService
  ) {}

  async ngOnInit() {
    this.isMobile = this.breakpointObserver.isMatched([Breakpoints.Handset]);
    this.checkMobile();

    // Deep link da notifica push: legge ?openNote=<id> o navigation queue (iOS deep sleep)
    const urlParams = new URLSearchParams(window.location.search);
    this.deepLinkNoteId = urlParams.get('openNote') || await this.checkNavigationQueue();

    // Ascolta messaggi dal Service Worker (quando l'app è già aperta)
    if ('serviceWorker' in navigator) {
      this.swMessageListener = (event: MessageEvent) => {
        if (event.data?.type === 'OPEN_NOTE' && event.data.noteId) {
          const note = this.allNotes.find(n => n.id === event.data.noteId);
          if (note) {
            this.selectNote(note);
          } else {
            // Note non ancora caricate (encryption init in corso) → riusa il meccanismo deepLink
            this.deepLinkNoteId = event.data.noteId;
          }
        }
      };
      navigator.serviceWorker.addEventListener('message', this.swMessageListener);
    }

    // Inizializza cifratura E2E
    await this.initEncryption();

    // Redirect immediato se sessione scade/revocata
    this.authSub = this.authService.user$.pipe(skip(1)).subscribe(user => {
      if (!user) {
        this.router.navigate(['/login'], { replaceUrl: true });
      }
    });

    // Check periodico ogni 5 minuti: rileva account disabilitati/eliminati/token revocati
    this.sessionCheckInterval = setInterval(async () => {
      try {
        await this.authService.reloadUser();
      } catch {
        // Token revocato o account eliminato → authState emetterà null → redirect automatico
      }
    }, 5 * 60 * 1000);

    // Carica preferenza vista di default (solo mobile)
    if (this.isMobile) {
      const firestoreView = await this.noteService.getUserPreference<'list' | 'calendar'>(this.defaultViewKey, 'list');
      this.currentMainView = firestoreView;
      localStorage.setItem('punto_defaultView', firestoreView);
    }

    // Tutti gli init async completati — mostra il contenuto
    this.isReady = true;

    if (window.visualViewport) {
      const vv = window.visualViewport;
      // --lvh: layout viewport height (window.innerHeight), costante anche con tastiera aperta.
      document.documentElement.style.setProperty('--lvh', `${window.innerHeight}px`);
      // Su iOS Safari, position:fixed è già relativo al visual viewport → la floating toolbar
      // non ha bisogno di offset. Su Chrome/Android, position:fixed è relativo al layout
      // viewport → serve compensare l'altezza della tastiera.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      let overlayContainers: HTMLElement[] = [];
      const refreshDomRefs = () => {
        overlayContainers = Array.from(document.querySelectorAll('.cdk-overlay-container'));
      };
      refreshDomRefs();
      const setVh = () => {
        const h = vv.height;
        document.documentElement.style.setProperty('--vh', `${h}px`);
        if (!isIOS) {
          document.documentElement.style.setProperty('--keyboard-height', `${Math.max(0, window.innerHeight - h)}px`);
        }
        // iOS pans the visual viewport (offsetTop > 0) when keyboard opens to show focused input.
        // Resetting window scroll to 0 reverts the pan; then scrollIntoView handles scrolling
        // the focused element into view within .editor-content (the actual scrollable container).
        if (vv.offsetTop > 0) window.scrollTo(0, 0);
        for (const el of overlayContainers) { el.style.height = `${h}px`; el.style.maxHeight = `${h}px`; }
        setTimeout(() => {
          const active = document.activeElement as HTMLElement | null;
          if (active && active !== document.body && active.tagName !== 'MAT-SIDENAV-CONTAINER') {
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 320);
      };
      vv.addEventListener('resize', setVh);
      vv.addEventListener('scroll', setVh);
      setVh();
    }

    this.notes$ = this.noteService.getNotes();

    this.notesSub = this.notes$.subscribe({
      next: notes => {
        this.notesLoaded = true;
        this.hasFirestoreError = false;
        this.allNotes = notes;
        // this.updateAllTags(); // TODO: tags disabilitati temporaneamente
        this.applyFilter();
        // Apre la nota richiesta dal deep link (solo alla prima emissione utile)
        if (this.deepLinkNoteId) {
          const target = notes.find(n => n.id === this.deepLinkNoteId);
          if (target) {
            this.selectNote(target);
            this.deepLinkNoteId = null;
          } else {
            // Nota non trovata (es. eliminata) → mostra lista normalmente
            this.deepLinkNoteId = null;
          }
        }
      },
      error: () => { this.hasFirestoreError = true; }
    });

    this.pushService.requestPermission().then(() => {
      this.pushService.listenForMessages();
    }).catch(() => {
      console.warn('Push notifications non disponibili in questo browser.');
    });

    // Gestione back gesture mobile.
    // replaceState (non pushState) converte l'entry iniziale in uno stato JS puro:
    // iOS non ricarica la pagina quando il popstate torna a uno stato JS.
    window.history.replaceState({ punto: 'dashboard' }, '', window.location.href);
    window.addEventListener('popstate', this.onMobilePopState);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  private checkMobile() {
    this.breakpointObserver.observe([Breakpoints.Handset]).subscribe(result => {
      this.isMobile = result.matches;
    });
  }

  ngOnDestroy() {
    this.notesSub?.unsubscribe();
    this.authSub?.unsubscribe();
    clearInterval(this.sessionCheckInterval);
    clearTimeout(this.settingsMenuTimer);
    this.userDocUnsub?.();
    window.removeEventListener('popstate', this.onMobilePopState);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.swMessageListener) {
      navigator.serviceWorker?.removeEventListener('message', this.swMessageListener);
    }
  }

  // TODO: tags disabilitati temporaneamente
  // private updateAllTags() { ... }
  // toggleTagFilter(tag: string) { ... }
  // isTagSelected(tag: string): boolean { ... }
  // clearTagFilters() { ... }

  // ─── Pinned/Unpinned/Recurring getters ─────────────────────────────────────

  isRecurringSectionExpanded = true;
  isPinnedSectionExpanded = true;
  isNotesSectionExpanded = true;

  private isRecurring(n: Note): boolean { return !!(n.recurrence && n.recurrence !== 'none'); }

  get recurringNotes(): Note[] { return this.filteredNotes.filter(n => this.isRecurring(n)); }
  get pinnedNotes(): Note[] { return this.filteredNotes.filter(n => n.pinned && n.reminderStatus !== 'completed' && !this.isRecurring(n)); }
  get unpinnedNotes(): Note[] { return this.filteredNotes.filter(n => !n.pinned && n.reminderStatus !== 'completed' && !this.isRecurring(n)); }
  get completedReminderNotes(): Note[] {
    const completed = this.filteredNotes.filter(n => n.reminderStatus === 'completed');
    if (completed.length === 0 && this.activeListTab === 'evasi') {
      // Reset asincrono per evitare ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => { this.activeListTab = 'notes'; }, 0);
    }
    return completed;
  }

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

  getReminderTimeToday(note: Note): string | null {
    if (!note.reminderTime) return null;
    const today = new Date();
    const rem = new Date(note.reminderTime);
    if (rem.getFullYear() === today.getFullYear() &&
        rem.getMonth() === today.getMonth() &&
        rem.getDate() === today.getDate()) {
      return rem.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    }
    return null;
  }

  formatNextOccurrence(note: Note): string {
    if (!note.reminderTime || !note.recurrence || note.recurrence === 'none') return '';
    const d = new Date(note.reminderTime);
    const timeStr = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (note.recurrence === 'daily') {
      const day = d.toLocaleDateString('it-IT', { weekday: 'short' });
      return `${day.charAt(0).toUpperCase() + day.slice(1)} ${timeStr}`;
    }
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm} ${timeStr}`;
  }

  /** Colore di sfondo della card nota — null → CSS default (secondary-container) */
  getNoteCardBg(note: Note): string | null {
    if (note.color && note.color !== 'default') return note.color;
    return 'var(--punto-primary)';
  }

  // ─── Pin ────────────────────────────────────────────────────────────────────

  async togglePin(note: Note, event: Event) {
    event.stopPropagation();
    if (!note.id) return;
    try {
      await this.noteService.updateNote(note.id, { pinned: !note.pinned });
    } catch (e: any) {
      console.error('Errore pin:', e.message);
    }
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────

  // ─── E2E Encryption Setup ───────────────────────────────────────────────────

  private async initEncryption(): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;

    const userDoc = await this.noteService.getUserDoc();
    console.log('[E2E] userDoc:', userDoc ? JSON.stringify({
      encryptionSetup: userDoc['encryptionSetup'],
      hasPublicKey: !!userDoc['publicKey'],
      hasPrivateKey: !!userDoc['encryptedPrivateKey'],
      sessionVersion: userDoc['sessionVersion']
    }) : 'null');

    // Bug 1 fix: se getUserDoc ritorna null (offline/errore) e c'è già una chiave locale,
    // procedi senza mostrare alcun dialog (evita setup improprio).
    if (!userDoc) {
      const localKey = this.cryptoService.getLocalPrivateKey(uid);
      if (localKey) {
        // Non abbiamo la publicKey → sessione non attivabile, ma non mostriamo setup
        console.warn('[Encryption] UserDoc non disponibile offline, cifratura disabilitata per questa sessione');
        return;
      }
      // Nessun documento e nessuna chiave locale → nuovo utente, mostra setup
      await this.showSetupDialog(uid);
      return;
    }

    // ── BF-09: Check sessionVersion PRIMA del salvataggio — chiave stantia → reload per risblocco
    const localVersion = this.cryptoService.getLocalSessionVersion(uid);
    const remoteVersion = userDoc['sessionVersion'] as number | undefined;
    if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
      this.cryptoService.clearLocalKey(uid);
      this.cryptoService.clearLocalSessionVersion(uid);
      window.location.reload();
      return;
    }

    // ── Listener real-time: forced logout su sessionVersion mismatch (tab già aperta)
    this.userDocUnsub?.();
    this.userDocUnsub = this.noteService.watchUserDoc(uid, (latestDoc) => {
      // Non dipende da encryptionSetup: confronto diretto su sessionVersion
      if (!latestDoc) return;
      const localVersion = this.cryptoService.getLocalSessionVersion(uid);
      const remoteVersion = latestDoc['sessionVersion'];
      if (localVersion !== null && remoteVersion !== undefined && localVersion !== remoteVersion) {
        this.userDocUnsub?.();
        this.cryptoService.clearLocalKey(uid);
        this.cryptoService.clearLocalSessionVersion(uid);
        window.location.reload();
      }
    });

    // ── Reset su altro device: Firestore dice encryptionSetup === false → chiave locale stantia
    if (!userDoc['encryptionSetup']) {
      this.cryptoService.clearLocalKey(uid);
      this.cryptoService.clearLocalSessionVersion(uid);
      await this.showSetupDialog(uid);
      return;
    }

    // ── Check E2E: encryptionSetup === true OPPURE chiavi presenti (fallback backward compat cache)
    const isEncryptionConfigured =
      userDoc['encryptionSetup'] === true ||
      (!!userDoc['encryptedPrivateKey'] && !!userDoc['publicKey']);

    console.log('[E2E] isEncryptionConfigured:', isEncryptionConfigured);
    console.log('[E2E] localKey exists:', !!this.cryptoService.getLocalPrivateKey(uid));
    console.log('[E2E] localSessionVersion:', this.cryptoService.getLocalSessionVersion(uid));

    if (isEncryptionConfigured) {
      // Chiave già configurata — controlla localStorage
      const localKey = this.cryptoService.getLocalPrivateKey(uid);
      if (localKey) {
        this.cryptoService.setSession(uid, userDoc['publicKey']);
        if (this.cryptoService.getLocalSessionVersion(uid) === null) {
          this.cryptoService.saveLocalSessionVersion(uid, userDoc['sessionVersion'] ?? 1);
        }
        return;
      }
      // Nuovo device: sblocca con passphrase (NON setup)
      await this.showUnlockDialog(uid, userDoc['publicKey'], userDoc['encryptedPrivateKey'], userDoc['sessionVersion'] ?? 1);
    } else {
      // Primo setup reale (encryptionSetup assente o false)
      await this.showSetupDialog(uid);
    }
  }

  private async showSetupDialog(uid: string): Promise<void> {
    const ref = this.dialog.open(PassphraseDialogComponent, {
      data: { mode: 'setup' },
      disableClose: true,
      width: '420px',
      maxWidth: '95vw'
    });
    const passphrase = await firstValueFrom(ref.afterClosed());
    if (!passphrase) return; // utente annulla: procede senza cifratura

    try {
      console.log('[E2E Setup] Step 1: generazione chiavi...');
      const { publicKey, encryptedPrivateKey } = await this.cryptoService.generateAndStoreKeys(uid, passphrase);
      console.log('[E2E Setup] Step 1 OK — publicKey len:', publicKey?.length, 'encryptedPrivateKey len:', encryptedPrivateKey?.length);

      console.log('[E2E Setup] Step 2: salvataggio chiavi su Firestore...');
      const sessionVersion = await this.noteService.saveEncryptionKeys(publicKey, encryptedPrivateKey);
      console.log('[E2E Setup] Step 2 OK — sessionVersion:', sessionVersion);

      this.cryptoService.setSession(uid, publicKey);
      this.cryptoService.saveLocalSessionVersion(uid, sessionVersion);
      console.log('[E2E Setup] Sessione attiva. Cifro note esistenti...');

      await this.noteService.encryptExistingNotes();
      console.log('[E2E Setup] Setup completato.');
    } catch (e) {
      console.error('[E2E Setup] ERRORE:', e);
      this.snackBar.open('Errore durante il setup della cifratura. Riprova.', 'OK', { duration: 5000 });
    }
  }

  private async showUnlockDialog(uid: string, publicKey: string, encryptedPrivateKey: string, sessionVersion: number): Promise<void> {
    let unlocked = false;
    while (!unlocked) {
      const ref = this.dialog.open(PassphraseDialogComponent, {
        data: { mode: 'unlock' },
        disableClose: true,
        width: '420px',
        maxWidth: '95vw'
      });
      const passphrase = await firstValueFrom(ref.afterClosed());
      if (!passphrase) return; // utente annulla
      try {
        await this.cryptoService.unlockPrivateKey(uid, encryptedPrivateKey, passphrase);
        this.cryptoService.setSession(uid, publicKey);
        this.cryptoService.saveLocalSessionVersion(uid, sessionVersion);
        unlocked = true;
      } catch {
        // Passphrase errata: il dialog si riapre
      }
    }
  }

  /** Cambia passphrase E2E: re-cifra la chiave privata e invalida le altre sessioni. */
  async changeEncryptionPassphrase(oldPassphrase: string, newPassphrase: string): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;
    const userDoc = await this.noteService.getUserDoc();
    if (!userDoc?.encryptedPrivateKey) return;

    const newEncryptedPrivateKey = await this.cryptoService.changePassphrase(
      uid, oldPassphrase, newPassphrase, userDoc.encryptedPrivateKey
    );
    const newSessionVersion = await this.noteService.updateEncryptedPrivateKey(newEncryptedPrivateKey);
    // Aggiorna la versione locale (questa sessione rimane attiva)
    this.cryptoService.saveLocalSessionVersion(uid, newSessionVersion);
  }

  private async checkNavigationQueue(): Promise<string | null> {
    if (!('caches' in window)) return null;
    try {
      const cache = await caches.open('punto-nav-queue');
      const res = await cache.match('pending-nav');
      if (!res) return null;
      const data = await res.json();
      await cache.delete('pending-nav');
      // Ignora voci più vecchie di 5 minuti (navigazione stantia)
      if (Date.now() - data.ts > 5 * 60 * 1000) return null;
      return data.noteId ?? null;
    } catch {
      return null;
    }
  }

  openSettings() { this.router.navigate(['/settings']); }
  logout() { this.authService.logout().then(() => this.router.navigate(['/login'])); }
  openNoteEditor() { this.newNoteCalendarDate = undefined; this.activeNote = null; }
  openNoteEditorFromCalendar(date?: Date) {
    const now = new Date();
    // Usa la data passata (dal calendario settimana/mese) oppure oggi
    const target = date ?? new Date();
    target.setHours(now.getHours(), now.getMinutes(), 0, 0);
    this.newNoteCalendarDate = target;
    this.activeNote = null;
  }
  selectNote(note: Note) {
    if (!this.isMobile && this.activeNote?.id === note.id) {
      this.activeNote = undefined;
    } else {
      this.activeNote = note;
    }
  }

  openNoteById(noteId: string) {
    const note = this.allNotes.find(n => n.id === noteId);
    if (note) this.selectNote(note);
  }

  closeEditor() { this.deactivateNote(); }
  handleBackButton() {
    if (this.activeNote !== undefined) this.deactivateNote();
    else this.currentMainView = 'list';
  }

  private deactivateNote() {
    this.activeNote = undefined;
    this.newNoteCalendarDate = undefined;
    // Previene che eventi touch residui triggherino il menu impostazioni al ritorno dal editor
    this.settingsMenuEnabled = false;
    clearTimeout(this.settingsMenuTimer);
    this.settingsMenuTimer = setTimeout(() => { this.settingsMenuEnabled = true; }, 150);
  }
  onCalendarNoteSelected(note: Note) { this.activeNote = note; }

  async setDefaultView(view: 'list' | 'calendar') {
    this.currentMainView = view;
    localStorage.setItem('punto_defaultView', view);
    if (this.isMobile) {
      await this.noteService.setUserPreference(this.defaultViewKey, view);
    }
  }

  // ─── Swipe mobile ───────────────────────────────────────────────────────────

  private touchStartX = 0;
  private touchStartY = 0;

  onTouchStart(e: TouchEvent) {
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  onTouchEnd(e: TouchEvent) {
    if (!this.isMobile) return;
    const deltaX = e.changedTouches[0].clientX - this.touchStartX;
    const deltaY = e.changedTouches[0].clientY - this.touchStartY;
    // Gesto verticale → scroll, non swipe
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;
    if (Math.abs(deltaX) < 60) return;
    // Swipe destra nell'editor → torna indietro
    if (deltaX > 0 && this.activeNote !== undefined) {
      this.handleBackButton();
      return;
    }
    // Swipe sinistra su lista → calendario
    if (deltaX < 0 && this.currentMainView === 'list' && this.activeNote === undefined) {
      this.setDefaultView('calendar');
    }
    // Swipe destra su calendario → lista
    else if (deltaX > 0 && this.currentMainView === 'calendar' && this.activeNote === undefined) {
      this.setDefaultView('list');
    }
  }

  private onMobilePopState = (_event: PopStateEvent) => {
    // Spingi subito uno stato per rimanere sull'URL attuale (no navigazione browser)
    window.history.pushState({ punto: 'dashboard' }, '', window.location.href);
    // Non navigare se l'utente sta digitando (iOS genera popstate spuri su backspace in input vuoto)
    const active = document.activeElement;
    const isTyping = active && (
      active.tagName === 'INPUT' ||
      active.tagName === 'TEXTAREA' ||
      (active as HTMLElement).isContentEditable
    );
    if (this.isMobile && !isTyping) {
      this.handleBackButton();
    }
  };

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async deleteActiveNote() {
    if (!this.activeNote?.id) return;
    const note = this.activeNote as Note;
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
      this.activeNote = undefined;
      await this.noteService.deleteNote(note.id!);
    } catch (e: any) {
      console.error('Errore eliminazione:', e.message);
    }
  }

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
    } catch (e: any) {
      console.error('Errore eliminazione:', e.message);
    }
  }

  changeThemeColor(color: string) {
    document.documentElement.style.setProperty('--mdc-theme-primary', color);
  }
}
