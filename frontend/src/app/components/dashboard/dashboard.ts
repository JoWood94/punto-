import { Component, inject, NgZone, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth';
import { NoteService, Note, NoteType, getNotePreview, getChecklistProgress, hasReminder, getReminderTime, getReminderStatus, getNoteRecurrence, isRecurringNote } from '../../services/note';
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
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastService } from '../../services/toast';
import { MatChipsModule } from '@angular/material/chips';
import { NoteEditorComponent } from '../note-editor/note-editor';
import { CreateFabComponent } from '../create-fab/create-fab.component';
import { CalendarViewComponent } from '../calendar-view/calendar-view.component';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';
import { PassphraseDialogComponent } from '../passphrase-dialog/passphrase-dialog';
import { UpdateDialogComponent } from '../update-dialog/update-dialog';
import { UsernameDialogComponent } from '../username-dialog/username-dialog';
import { JoinByCodeDialogComponent } from '../join-by-code-dialog/join-by-code-dialog';
import { CalendarFilterDialogComponent } from '../calendar-filter-dialog/calendar-filter-dialog.component';
import { CalendarManageDialogComponent } from '../calendar-manage-dialog/calendar-manage-dialog.component';
import { AddCalendarDialogComponent } from '../add-calendar-dialog/add-calendar-dialog.component';
import { SettingsComponent } from '../settings/settings.component';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';
import { Observable, Subscription, firstValueFrom, skip } from 'rxjs';
import { Location } from '@angular/common';
import { PushNotificationService } from '../../services/push-notification';
import { CalendarService, Calendar } from '../../services/calendar';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { SwUpdate } from '@angular/service-worker';
import { environment } from '../../../environments/environment';

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
    MatProgressSpinnerModule,
    MatChipsModule,
    NoteEditorComponent,
    CalendarViewComponent,
    CreateFabComponent,
    SettingsComponent,
    TranslateModule,
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
  private toast = inject(ToastService);
  translationService = inject(TranslationService);
  private cryptoService: CryptoService = inject(CryptoService);
@ViewChild('sidenav') sidenav!: MatSidenav;
  /** Riferimento all'editor attivo — usato dalla mobile toolbar in dashboard.html */
  @ViewChild('noteEditor') noteEditorComp?: NoteEditorComponent;

  notes$: Observable<Note[]> | null = null;
  private myUsername: string | null = null;
  themeColors = ['#6200ee', '#1e88e5', '#43a047', '#e53935', '#ffb300'];

  activeNote?: Note | null = undefined;
  editorLeaving = false;   // trigger animazione uscita editor mobile
  // Opzione A: settings embedded dentro la shell del dashboard — niente pagina
  // dedicata. L'header dell'app resta visibile con il tasto back che chiude.
  settingsOpen = false;
  isMobile = false;
  isWideDesktop = false;  // >=1280px: sidenav sempre aperta, no unified-toolbar
  currentMainView: 'list' | 'calendar' = 'calendar';
  activeView: 'notes' | 'reminders' = 'notes';
  private viewAutoSelected = false;

  // ─── Calendario: ricorda l'ultima vista usata nella sessione ──
  lastCalendarView: 'day' | 'week' | 'month' = 'month';

  // ─── Mobile unified nav toolbar ──────────────────────────────
  mobileNav: 'notes' | 'reminders' | 'calendar' = 'notes';
  navDragging = false;
  navIndicatorTransform = 'translateX(0px)';
  private navDragStartX = 0;
  private navDragStartIndex = 0;
  // Su tablet/desktop (!isMobile) il calendario è già visibile a destra accanto
  // alla note-list: il segmento "Calendario" nella toolbar è ridondante e va
  // filtrato dall'array. Solo su mobile mostriamo tutti e tre i segmenti.
  get NAV_SEGMENTS(): Array<'notes' | 'reminders' | 'calendar'> {
    return this.isMobile ? ['notes', 'reminders', 'calendar'] : ['notes', 'reminders'];
  }
  readonly NAV_SEGMENT_META: Record<'notes' | 'reminders' | 'calendar', { icon: string; labelKey: string }> = {
    notes: { icon: 'edit_note', labelKey: 'NAV.NOTES' },
    reminders: { icon: 'notifications', labelKey: 'NAV.REMINDERS' },
    calendar: { icon: 'calendar_month', labelKey: 'NAV.CALENDAR' },
  };
  private readonly NAV_SEG_WIDTH = 52; // deve corrispondere al CSS
  isOffline = !navigator.onLine;
  hasFirestoreError = false;
  private defaultViewKey = 'defaultView';

  calendarShowAllNotes = false;
  allNotes: Note[] = [];
  filteredNotes: Note[] = [];
  myCalendars: Calendar[] = [];
  searchQuery = '';
  newNoteCalendarDate: Date | undefined = undefined;
  newNoteType: NoteType = 'note';
  newNoteCalendarId: string | undefined = undefined;
  notesLoaded = false;
  pendingSelectNoteId: string | null = null;
  calendarCurrentDate: Date = new Date();
  calendarPref: { showMemos: boolean; hiddenCalendarIds: string[] } = { showMemos: true, hiddenCalendarIds: [] };

  /**
   * Sottinsieme di myCalendars owned dall'utente corrente.
   * myCalendars è popolato da getAllVisibleCalendars() che unisce owned + subscribed:
   * il filtro per uid separa i propri calendari da quelli altrui.
   */
  get ownedCalendars(): Calendar[] {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return [];
    return this.myCalendars.filter(c => c.uid === uid);
  }

  // TODO: tags disabilitati temporaneamente
  // allTags: string[] = [];
  // selectedTags: string[] = [];

  private notesSub?: Subscription;
  private authSub?: Subscription;
  private routeSub?: Subscription;
  private calendarsSub?: Subscription;
  // Snapshot delle note dove sono guest, mantenuto tra emissioni di notes$.
  // null = lista non ancora inizializzata (prima emissione: no diff).
  // Usato per rilevare quando una nota condivisa sparisce (owner l'ha eliminata
  // o mi ha rimosso dai collaboratori) e mostrare un toast all'utente.
  // Teniamo anche ownerUid per risolvere l'username dell'owner nel toast.
  private prevSharedSnapshot: Map<string, { title: string; ownerUid: string }> | null = null;
  // Marcatori per escludere dal toast i casi di uscita volontaria del guest
  // (altrimenti il diff-detector tratterebbe la propria leave come kickout).
  private voluntaryLeaves = new Set<string>();
  private sessionCheckInterval?: ReturnType<typeof setInterval>;
  private userDocUnsub?: () => void;
  private settingsMenuTimer?: ReturnType<typeof setTimeout>;
  private deepLinkTimeout?: ReturnType<typeof setTimeout>;
  settingsMenuEnabled = true;
  isReady = false;
  updatePending = false;
  private deepLinkNoteId: string | null = null;
  private updateDialogShown = false;
  private swMessageListener?: (event: MessageEvent) => void;
  private swControllerChangeListener?: () => void;
  private versionCheckInterval?: ReturnType<typeof setInterval>;
  private readonly onOnline = () => { this.isOffline = false; this.hasFirestoreError = false; };
  private readonly onOffline = () => { this.isOffline = true; };

  private swUpdate = inject(SwUpdate);
  private ngZone = inject(NgZone);

  private calendarService: CalendarService = inject(CalendarService);

  constructor(
    private noteService: NoteService,
    private pushService: PushNotificationService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    this.isMobile = this.breakpointObserver.isMatched([Breakpoints.Handset]);
    this.isWideDesktop = this.breakpointObserver.isMatched(['(min-width: 1280px)']);
    this.checkMobile();

    // Pre-fetch username for completion notifications on shared notes
    this.noteService.getUsername().then(u => this.myUsername = u).catch(() => {});

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY' && !this.updateDialogShown) {
          this.updateDialogShown = true;
          this.ngZone.run(() => {
            const ref = this.dialog.open(UpdateDialogComponent);
            ref.afterClosed().subscribe(() => {
              this.updatePending = true;
            });
          });
        }
      });
    }

    // combined-sw.js usa skipWaiting()+clients.claim() → VERSION_READY non viene emesso.
    // Quando un nuovo SW prende il controllo, il browser spara 'controllerchange' sul
    // ServiceWorkerContainer. In quel momento la pagina ha ancora il vecchio bundle in
    // memoria ma il nuovo SW servirà la nuova version.json → mismatch rilevato.
    if ('serviceWorker' in navigator) {
      this.swControllerChangeListener = () => this.checkAppVersion();
      navigator.serviceWorker.addEventListener('controllerchange', this.swControllerChangeListener);
    }
    // Safety net: polling ogni 10 min per rilevare nuove versioni in sessioni molto lunghe
    // o nei casi in cui controllerchange sia già avvenuto prima della registrazione del listener.
    this.versionCheckInterval = setInterval(() => this.checkAppVersion(), 10 * 60 * 1000);

    // Inizializza lingua (legge pref Firestore, fallback a navigator.language)
    await this.translationService.init();

    // Deep link da notifica push: navigation queue (iOS deep sleep)
    const navQueueNoteId = await this.checkNavigationQueue();
    if (navQueueNoteId) {
      this.deepLinkNoteId = navQueueNoteId;
      this.armDeepLinkTimeout();
    }

    // Reagisce a ?openNote= sia al caricamento iniziale sia a cambi URL successivi
    // (es. app gia aperta, SW chiama clients.openWindow con nuovo URL)
    this.routeSub = this.route.queryParams.subscribe(params => {
      const noteId = params['openNote'];
      if (noteId && noteId !== this.deepLinkNoteId) {
        const note = this.allNotes.find(n => n.id === noteId);
        if (note) {
          this.selectNote(note);
        } else {
          this.deepLinkNoteId = noteId;
          this.armDeepLinkTimeout();
        }
      }
    });

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
            this.armDeepLinkTimeout();
          }
        }
      };
      navigator.serviceWorker.addEventListener('message', this.swMessageListener);
    }

    // Inizializza cifratura E2E
    await this.initEncryption();

    // Pre-warm cache AES: carica in parallelo le sharedKeys di tutte le note
    // AES-cifrate (owned post-share + guest). Deve avvenire DOPO initEncryption
    // (la PGP private key deve essere unlockkata) e PRIMA di isReady=true
    // (i listener Firestore partono al mount e richiedono la cache popolata).
    // Se offline o errore, il preload è silenzioso: lo skip-emit nei stream
    // gestisce eventuali miss residui.
    const currentUid = this.authService.getCurrentUserId();
    if (currentUid) {
      await this.noteService.preloadSharedKeys(currentUid);
    }

    // Richiede username agli utenti esistenti che non ne hanno ancora uno
    this.checkAndPromptUsername();

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
      const firestoreView = await this.noteService.getUserPreference<'list' | 'calendar' | 'reminders'>(this.defaultViewKey, 'list');
      if (firestoreView === 'calendar') {
        this.setMobileNav('calendar');
      } else if (firestoreView === 'reminders') {
        this.setMobileNav('reminders');
      } else {
        this.setMobileNav('notes');
        localStorage.setItem('punto_defaultView', 'list');
      }
      // Preferenza caricata da Firestore — blocca autoSelectView() dal sovrascrivere la scelta utente
      this.viewAutoSelected = true;
    }

    // Carica preferenza titolo notifiche
    const notifTitle = await this.noteService.getUserPreference<boolean>('notifTitleEnabled', false);
    this.noteService.setNotifTitleEnabled(notifTitle);

    // Carica preferenza visibilità calendario
    this.calendarShowAllNotes = await this.noteService.getUserPreference<boolean>('calendarShowAllNotes', false);

    // Carica preferenze filtro calendari
    this.noteService.getUserPreference<{ showMemos: boolean; hiddenCalendarIds: string[] }>(
      'calendarView',
      { showMemos: true, hiddenCalendarIds: [] }
    ).then(p => {
      this.calendarPref = p ?? { showMemos: true, hiddenCalendarIds: [] };
      console.log('[DBG-EVT-FILTER] loaded pref', this.calendarPref);
    });

    // Tutti gli init async completati — mostra il contenuto
    this.isReady = true;

    // Salva la versione client nel documento utente Firestore (solo se cambiata)
    this.writeClientVersion();

    // Version handshake — controlla se il client è aggiornato
    this.checkAppVersion();

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
      // Bug PWA primo avvio iOS: visualViewport.height + env(safe-area-inset-*)
      // a volte sono stale finché un evento di layout non li rinfresca.
      // Combiniamo più tecniche: minHeight kick (forza reflow), scroll kick (forza
      // visualViewport recompute), pipeline lunga di setTimeout (alcuni device
      // stabilizzano dopo >1s), listener visibilitychange (ritorno da background).
      const kick = () => {
        document.body.style.minHeight = '101vh';
        requestAnimationFrame(() => {
          document.body.style.minHeight = '';
          // scroll kick: alcuni iOS aggiornano visualViewport solo dopo uno scroll.
          // Usiamo +1/-1 per non spostare visivamente nulla.
          window.scrollTo(0, 1);
          requestAnimationFrame(() => {
            window.scrollTo(0, 0);
            setVh();
          });
        });
      };
      setVh();
      requestAnimationFrame(() => requestAnimationFrame(setVh));
      // Pipeline aggressiva per coprire device lenti / first-launch PWA.
      // Costa ~zero (ogni tick è un assignment di CSS var) ma risolve il glitch.
      setTimeout(kick, 50);
      setTimeout(kick, 300);
      setTimeout(kick, 800);
      setTimeout(kick, 1500);
      setTimeout(kick, 3000);
      window.addEventListener('orientationchange', () => {
        setVh();
        setTimeout(setVh, 250);
        setTimeout(kick, 500);
      });
      window.addEventListener('pageshow', setVh);
      // PWA torna in foreground (es. dopo background → home → riapertura): forza ricalcolo
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          kick();
          setTimeout(kick, 200);
        }
      });
    }

    this.notes$ = this.noteService.getNotes();

    this.notesSub = this.notes$.subscribe({
      next: notes => {
        this.notesLoaded = true;
        this.hasFirestoreError = false;
        this.allNotes = notes;
        // Diff-detector sulle note dove sono guest: se una scompare tra un'emissione
        // e l'altra e non ho fatto una leave volontaria (né è aperta nell'editor,
        // caso gestito da _handleKickout in note-editor), mostro un toast che avvisa
        // l'utente che non ha più accesso (owner ha rimosso o eliminato la nota).
        const currentSharedSnapshot = new Map<string, { title: string; ownerUid: string }>();
        for (const n of notes) {
          // Escludi gli eventi di calendar: il loro myRole='guest' deriva dalla
          // subscription al calendario, non da una share esplicita. Una sparizione
          // transitoria nel feed (race del visibleCalIds$) NON è un kick-out.
          if (n.myRole === 'guest' && n.id && n.type !== 'event') {
            currentSharedSnapshot.set(n.id, { title: n.title ?? '', ownerUid: n.uid ?? '' });
          }
        }
        console.log('[diff-shared] prev:', this.prevSharedSnapshot ? [...this.prevSharedSnapshot.keys()] : null,
          'current:', [...currentSharedSnapshot.keys()]);
        if (this.prevSharedSnapshot !== null) {
          for (const [id, snap] of this.prevSharedSnapshot) {
            if (currentSharedSnapshot.has(id)) continue;
            if (this.voluntaryLeaves.has(id)) { this.voluntaryLeaves.delete(id); continue; }
            if (this.activeNote?.id === id) continue;
            console.log('[diff-shared] kicked-out detected for note:', id, 'title:', snap.title);
            this._notifyKickedOut(snap.title, snap.ownerUid);
          }
        }
        this.prevSharedSnapshot = currentSharedSnapshot;
        // this.updateAllTags(); // TODO: tags disabilitati temporaneamente
        this.applyFilter();
        this.autoSelectView();
        if (this.pendingSelectNoteId) {
          const newNote = notes.find(n => n.id === this.pendingSelectNoteId);
          if (newNote) {
            // Only select if we're still in new-note mode (editor open but no note assigned yet)
            if (this.activeNote === null) {
              this.activeNote = newNote;
            }
            this.pendingSelectNoteId = null; // always clear once found
          }
        }
        // Apre la nota richiesta dal deep link alla prima emissione utile.
        // Non azzerare se non trovata: encryption potrebbe ancora inizializzarsi
        // e le note arrivare in emissioni successive. Il timeout (10s) fa da safety net.
        if (this.deepLinkNoteId) {
          const target = notes.find(n => n.id === this.deepLinkNoteId);
          if (target) {
            this.selectNote(target);
            this.deepLinkNoteId = null;
            clearTimeout(this.deepLinkTimeout);
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

    // getAllVisibleCalendars() unisce owned + subscribed (dedup by id, owned wins).
    // Così la filter-dialog mostra anche i calendari a cui l'utente è iscritto.
    this.calendarsSub = this.calendarService.getAllVisibleCalendars().subscribe({
      next: cals => {
        this.myCalendars = cals;
      },
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
      // Resize mobile→tablet con mobileNav='calendar': il segmento sparisce
      // dall'array filtrato, l'indicator finirebbe a -52px. Riallinea su 'notes'.
      if (!this.isMobile && this.mobileNav === 'calendar') {
        this.setMobileNav('notes');
      }
    });
    this.breakpointObserver.observe(['(min-width: 1280px)']).subscribe(result => {
      this.isWideDesktop = result.matches;
    });
  }

  private armDeepLinkTimeout() {
    clearTimeout(this.deepLinkTimeout);
    this.deepLinkTimeout = setTimeout(() => { this.deepLinkNoteId = null; }, 10000);
  }

  private async writeClientVersion() {
    try {
      const current = await this.noteService.getUserPreference<string>('clientVersion', '');
      if (current !== environment.appVersion) {
        await this.noteService.setUserPreference('clientVersion', environment.appVersion);
      }
    } catch {
      // Offline o errore: ignora silenziosamente
    }
  }

  private async checkAppVersion() {
    try {
      const base = document.baseURI.endsWith('/') ? document.baseURI : document.baseURI + '/';
      const res = await fetch(base + 'version.json?_=' + Date.now());
      if (!res.ok) return;
      const data = await res.json();
      console.log('[checkAppVersion] server=', data.version, 'client=', environment.appVersion);
      if (data.version && data.version !== environment.appVersion) {
        // Mismatch rilevata: il server ha una versione più recente del bundle in memoria.
        //
        // NOTE: combined-sw.js usa skipWaiting()+clients.claim() — il nuovo SW può aver
        // preso il controllo della pagina SENZA emettere VERSION_READY. In quel caso
        // checkForUpdate() restituisce false (il nuovo SW non vede versioni successive a sé).
        // Per questo apriamo il dialog direttamente sulla base del mismatch, senza dipendere
        // dal segnale del SW. checkForUpdate() è chiamato comunque (fire-and-forget) per
        // garantire che il bundle aggiornato sia pronto per il ricaricamento.
        if (this.swUpdate.isEnabled) {
          this.swUpdate.checkForUpdate().catch(() => {});
        }
        if (!this.updateDialogShown) {
          this.updateDialogShown = true;
          this.ngZone.run(() => {
            const ref = this.dialog.open(UpdateDialogComponent);
            ref.afterClosed().subscribe(() => { this.updatePending = true; });
          });
        }
      }
    } catch (e) {
      console.warn('[checkAppVersion] error', e);
    }
  }

  ngOnDestroy() {
    this.notesSub?.unsubscribe();
    this.authSub?.unsubscribe();
    this.routeSub?.unsubscribe();
    this.calendarsSub?.unsubscribe();
    clearInterval(this.sessionCheckInterval);
    clearInterval(this.versionCheckInterval);
    clearTimeout(this.settingsMenuTimer);
    clearTimeout(this.deepLinkTimeout);
    this.userDocUnsub?.();
    window.removeEventListener('popstate', this.onMobilePopState);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.swMessageListener) {
      navigator.serviceWorker?.removeEventListener('message', this.swMessageListener);
    }
    if (this.swControllerChangeListener) {
      navigator.serviceWorker?.removeEventListener('controllerchange', this.swControllerChangeListener);
    }
  }

  // TODO: tags disabilitati temporaneamente
  // private updateAllTags() { ... }
  // toggleTagFilter(tag: string) { ... }
  // isTagSelected(tag: string): boolean { ... }
  // clearTagFilters() { ... }

  // ─── Pinned/Unpinned/Recurring getters ─────────────────────────────────────

  isPinnedSectionExpanded = true;
  isNotesSectionExpanded = true;
  isActiveReminderSectionExpanded = true;
  isReminderRecurringSectionExpanded = true;
  isEvadedSectionExpanded = true;
  isSharedWithMeSectionExpanded = true;

  private _calendarNotesCache: Note[] = [];
  private _calendarNotesCacheKey: { src: Note[] | null; showAll: boolean; prefRef: { showMemos: boolean; hiddenCalendarIds: string[] } | null } = {
    src: null,
    showAll: false,
    prefRef: null,
  };

  get calendarNotes(): Note[] {
    const showAll = this.calendarShowAllNotes;
    const pref = this.calendarPref;
    if (
      this._calendarNotesCacheKey.src === this.allNotes &&
      this._calendarNotesCacheKey.showAll === showAll &&
      this._calendarNotesCacheKey.prefRef === pref
    ) {
      return this._calendarNotesCache;
    }
    // Gli eventi (type='event') vanno sempre inclusi nel base array indipendentemente
    // da hasReminder: il default reminder per event è OFF (Slice H decoupling), e
    // la posizione nel calendario è determinata da eventStart, non da reminderTime.
    const base = showAll
      ? this.allNotes
      : this.allNotes.filter(n => hasReminder(n) || n.type === 'event');
    const filtered = base.filter(n => {
      if (n.type === 'memo') return pref.showMemos;
      if (n.type === 'event') {
        if (!n.calendarId) return false;
        return !pref.hiddenCalendarIds.includes(n.calendarId);
      }
      // 'note' senza reminder non arriva qui (filtro hasReminder), difensivo
      return true;
    });
    this._calendarNotesCache = filtered;
    this._calendarNotesCacheKey = { src: this.allNotes, showAll, prefRef: pref };
    return this._calendarNotesCache;
  }

  get searchPlaceholder(): string {
    return this.translationService.instant(
      (this.mobileNav === 'reminders' || this.activeView === 'reminders')
        ? 'SEARCH.PLACEHOLDER_REMINDERS'
        : 'SEARCH.PLACEHOLDER_NOTES'
    );
  }

  // ─── Vista NOTE: solo note senza reminder, senza ricorrenza, e NON eventi.
  // Gli eventi (type='event') vivono solo nel calendario indipendentemente dal
  // reminder (default OFF), quindi vanno esclusi anche da pinned/plain.
  get pinnedNotes(): Note[] {
    return this.filteredNotes.filter(n => n.type !== 'event' && n.pinned && !hasReminder(n) && !isRecurringNote(n) && n.myRole !== 'guest');
  }
  get plainNotes(): Note[] {
    return this.filteredNotes.filter(n => n.type !== 'event' && !n.pinned && !hasReminder(n) && !isRecurringNote(n) && n.myRole !== 'guest');
  }

  // ─── Vista PROMEMORIA ─────────────────────────────────────────
  // Note condivise con reminder appaiono qui insieme alle proprie (BF-JJ)
  get activeReminderNotes(): Note[] {
    const memos = this.filteredNotes.filter(n => n.type === 'memo' && hasReminder(n) && getReminderStatus(n) !== 'completed' && !isRecurringNote(n));
    return memos;
  }
  get recurringReminderNotes(): Note[] {
    return this.filteredNotes.filter(n => n.type === 'memo' && isRecurringNote(n));
  }
  get evadedNotes(): Note[] {
    return this.filteredNotes.filter(n => n.type === 'memo' && getReminderStatus(n) === 'completed');
  }

  // ─── Condivise con me (solo senza reminder) ───────────────────
  // Le condivise con reminder vivono in vista Promemoria insieme alle proprie.
  // Gli eventi (type='event') sono ESCLUSI: vivono solo nella vista calendario,
  // mai nella lista note (anche per il guest del calendario).
  get sharedWithMeNotes(): Note[] {
    return this.filteredNotes.filter(n => n.myRole === 'guest' && n.type !== 'event' && !hasReminder(n));
  }

  private autoSelectView() {
    if (this.viewAutoSelected) return;
    this.viewAutoSelected = true;
    const hasNotes = this.pinnedNotes.length > 0 || this.plainNotes.length > 0;
    const hasReminders = this.activeReminderNotes.length > 0
      || this.recurringReminderNotes.length > 0
      || this.evadedNotes.length > 0;
    if (!hasNotes && hasReminders) {
      this.activeView = 'reminders';
      if (this.isMobile) this.setMobileNav('reminders');
    }
  }

  setMobileNav(view: 'notes' | 'reminders' | 'calendar') {
    this.mobileNav = view;
    const index = this.NAV_SEGMENTS.indexOf(view);
    this.navIndicatorTransform = `translateX(${index * this.NAV_SEG_WIDTH}px)`;
    if (view === 'calendar') {
      this.currentMainView = 'calendar';
    } else {
      this.currentMainView = 'list';
      this.activeView = view;
    }
  }

  onNavTouchStart(e: TouchEvent) {
    this.navDragging = true;
    this.navDragStartX = e.touches[0].clientX;
    this.navDragStartIndex = this.NAV_SEGMENTS.indexOf(this.mobileNav);
  }

  onNavTouchMove(e: TouchEvent) {
    if (!this.navDragging) return;
    e.preventDefault();
    const dx = e.touches[0].clientX - this.navDragStartX;
    const rawOffset = this.navDragStartIndex * this.NAV_SEG_WIDTH + dx;
    const maxOffset = (this.NAV_SEGMENTS.length - 1) * this.NAV_SEG_WIDTH;
    const clamped = Math.max(0, Math.min(maxOffset, rawOffset));
    this.navIndicatorTransform = `translateX(${clamped}px)`;
    // Aggiorna icona attiva in real-time
    const liveIndex = Math.max(0, Math.min(
      this.NAV_SEGMENTS.length - 1,
      Math.round(rawOffset / this.NAV_SEG_WIDTH)
    ));
    this.mobileNav = this.NAV_SEGMENTS[liveIndex];
  }

  onNavTouchEnd(e: TouchEvent) {
    if (!this.navDragging) return;
    this.navDragging = false;
    const endX = e.changedTouches[0]?.clientX ?? this.navDragStartX;
    const dx = endX - this.navDragStartX;
    // Tap (no drag significativo): leggiamo il segmento target dall'evento.
    // preventDefault nel touchmove + touch-action del container possono
    // sopprimere il click nativo da tap su iOS, lasciando il bottone senza
    // reazione. Risolviamo qui leggendo data-nav-index sul segment.
    if (Math.abs(dx) < 8) {
      const segEl = (e.target as HTMLElement).closest<HTMLElement>('.unified-toolbar-seg');
      if (segEl) {
        const parent = segEl.parentElement;
        const segs = parent
          ? Array.from(parent.querySelectorAll<HTMLElement>('.unified-toolbar-seg'))
          : [];
        const index = segs.indexOf(segEl);
        if (index >= 0 && index < this.NAV_SEGMENTS.length) {
          this.setMobileNav(this.NAV_SEGMENTS[index]);
          return;
        }
      }
      // Tap fuori dai segmenti: ripristina la posizione dell'indicatore.
      this.navIndicatorTransform = `translateX(${this.NAV_SEGMENTS.indexOf(this.mobileNav) * this.NAV_SEG_WIDTH}px)`;
      return;
    }
    const rawOffset = this.navDragStartIndex * this.NAV_SEG_WIDTH + dx;
    const snapIndex = Math.max(0, Math.min(
      this.NAV_SEGMENTS.length - 1,
      Math.round(rawOffset / this.NAV_SEG_WIDTH)
    ));
    this.setMobileNav(this.NAV_SEGMENTS[snapIndex]);
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
    const time = getReminderTime(note);
    if (!time) return null;
    const today = new Date();
    const rem = new Date(time);
    const hhmm = rem.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const isToday = rem.getFullYear() === today.getFullYear() &&
                    rem.getMonth() === today.getMonth() &&
                    rem.getDate() === today.getDate();
    if (isToday) return hhmm;
    // Non oggi: DD/MM HH:MM — pattern coerente con formatNextOccurrence dei ricorrenti.
    const dd = String(rem.getDate()).padStart(2, '0');
    const mm = String(rem.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm} ${hhmm}`;
  }

  formatNextOccurrence(note: Note): string {
    const time = getReminderTime(note);
    const recurrence = getNoteRecurrence(note);
    if (!time || recurrence === 'none') return '';
    const locale = this.translationService.locale;
    const d = new Date(time);
    const timeStr = d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    if (recurrence === 'daily') {
      const day = d.toLocaleDateString(locale, { weekday: 'short' });
      return `${day.charAt(0).toUpperCase() + day.slice(1)} ${timeStr}`;
    }
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${dd}/${mm} ${timeStr}`;
  }

  // ─── Template wrappers per helper reminder (template non può usare funzioni importate) ──
  noteHasReminder(n: Note): boolean { return hasReminder(n); }
  noteReminderStatus(n: Note): string | null { return getReminderStatus(n); }

  /**
   * URL thumbnail per la note card: primo ImageBlock nei blocks[] con data
   * base64, fallback al legacy note.image.data (Fase 2 pre-block).
   */
  noteThumbUrl(n: Note): string | null {
    const ib = (Array.isArray(n.blocks) ? n.blocks : []).find((b: any) => b.type === 'image' && b.data);
    if (ib) return (ib as any).data as string;
    const legacy = (n as any).image?.data;
    return typeof legacy === 'string' && legacy ? legacy : null;
  }
  noteIsRecurring(n: Note): boolean { return isRecurringNote(n); }

  /** Colore di sfondo della card nota — null → CSS default (secondary-container) */
  getNoteCardBg(note: Note): string | null {
    if (note.color && note.color !== 'default') return note.color;
    return 'var(--punto-primary)';
  }

  // ─── Pin ────────────────────────────────────────────────────────────────────

  async quickEvadi(note: Note, event: Event) {
    event.stopPropagation();
    if (!note.id) return;
    try {
      // Post RF-01b il reminder vive dentro blocks[type==='reminder'].status.
      // findReminderBlock prevale sul legacy n.reminderStatus, quindi dobbiamo
      // aggiornare il block (ricostruendo l'array) — altrimenti il filtro
      // della lista continua a vedere il memo come 'pending'.
      const update: any = { reminderStatus: 'completed' };
      const blocks = (note as any).blocks;
      if (Array.isArray(blocks)) {
        update.blocks = blocks.map((b: any) =>
          b?.type === 'reminder' ? { ...b, status: 'completed' } : b
        );
      }
      const isShared = note.isShared || (note.collaboratorUids && note.collaboratorUids.length > 0);
      if (isShared) {
        const uid = this.authService.getCurrentUserId();
        update.completionNotifyPending = true;
        update.completionNotifyBy = uid;
        update.completionNotifyByName = this.myUsername || this.translationService.instant('SHARING.UNKNOWN_COLLABORATOR');
        update.completionNotifyAt = Date.now();
      }
      await this.noteService.updateNote(note.id, update);
    } catch (e: any) {
      console.error('Errore evadi:', e.message);
    }
  }

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

  // ─── Username Setup ──────────────────────────────────────────────────────────

  private async checkAndPromptUsername(): Promise<void> {
    try {
      // Recupera username pending da registrazione
      const pending = localStorage.getItem('pendingUsername');
      if (pending) {
        await this.noteService.setUsername(pending); // lancia errore se uid null → catch lo gestisce
        localStorage.removeItem('pendingUsername');  // rimosso solo dopo salvataggio riuscito
        return; // username salvata, nessun dialog necessario
      }
      const userDoc = await this.noteService.getUserDoc();
      if (userDoc && !userDoc['username']) {
        this.dialog.open(UsernameDialogComponent, { disableClose: true, maxWidth: '440px' });
      }
    } catch { /* offline */ }
  }

  // ─── E2E Encryption Setup ───────────────────────────────────────────────────

  private async initEncryption(): Promise<void> {
    const uid = this.authService.getCurrentUserId();
    if (!uid) return;

    const userDocResult = await this.noteService.getUserDocResult();
    console.log('[E2E] userDocResult kind:',
      userDocResult === 'error' ? 'error' : userDocResult === null ? 'missing' : 'doc');

    // Errore di rete dopo retry esauriti: NON mostrare alcun dialog (mai setup —
    // sovrascriverebbe le chiavi server di un utente esistente). Esci silenzioso;
    // lo snapshot listener su userDoc, attivato più avanti, recupererà non appena
    // la rete torna, e l'utente può ricaricare per riprovare initEncryption.
    if (userDocResult === 'error') {
      console.error('[E2E] getUserDocResult fallito dopo retry. Salto init encryption per evitare setup improprio.');
      this.toast.show(this.translationService.instant('CRYPTO.NETWORK_ERROR') || 'Errore di rete, ricarica la pagina', 6000);
      return;
    }

    const userDoc = userDocResult;
    console.log('[E2E] userDoc:', userDoc ? JSON.stringify({
      encryptionSetup: userDoc['encryptionSetup'],
      hasPublicKey: !!userDoc['publicKey'],
      hasPrivateKey: !!userDoc['encryptedPrivateKey'],
      sessionVersion: userDoc['sessionVersion']
    }) : 'null');

    // userDoc null = doc non esiste (nuovo utente). Sicuro mostrare setup.
    if (!userDoc) {
      const localKey = this.cryptoService.getLocalPrivateKey(uid);
      if (localKey) {
        // Edge case storico: chiave locale presente ma userDoc cancellato → non mostriamo setup
        console.warn('[Encryption] UserDoc inesistente ma chiave locale presente, cifratura disabilitata per questa sessione');
        return;
      }
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
      // Guardia difensiva: chiavi null in Firestore (stato inconsistente da clearEncryptionKeys senza encryptionSetup:false)
      // → tratta come non configurato per evitare broken unlock loop con openpgp.readPrivateKey(null)
      if (!userDoc['publicKey'] || !userDoc['encryptedPrivateKey']) {
        await this.showSetupDialog(uid);
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
      this.toast.show(this.translationService.instant('CRYPTO.SETUP_ERROR'), 5000);
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
      const result = await firstValueFrom(ref.afterClosed());
      if (!result) return; // utente annulla
      if (result === 'reset') {
        // Utente richiede di resettare la secret
        const confirmed = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, {
          data: {
            title: this.translationService.instant('CRYPTO.RESET_TITLE'),
            message: this.translationService.instant('CRYPTO.RESET_MSG'),
            confirmLabel: this.translationService.instant('CRYPTO.RESET_CONFIRM'),
            cancelLabel: this.translationService.instant('COMMON.CANCEL')
          },
          disableClose: true,
          width: '420px',
          maxWidth: '95vw'
        }).afterClosed());
        if (confirmed) {
          await this.noteService.clearEncryptionKeys();
          this.cryptoService.clearSession();
          await this.showSetupDialog(uid);
          return;
        }
        continue; // Dialogo di reset annullato, riapri lo sblocco
      }
      try {
        await this.cryptoService.unlockPrivateKey(uid, encryptedPrivateKey, result);
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

  // Settings dropdown custom (pill stack coerente col resto app). Sostituisce
  // mat-menu il cui panelClass non veniva ereditato dagli override CSS globali.
  showSettingsDropdown = false;
  // Stato di uscita animata: il DOM resta montato durante la leave animation.
  // Pattern simmetrico a snooze-sheet → rendering coerente fra i tre menu.
  settingsDropdownLeaving = false;
  private settingsDropdownLeaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly SETTINGS_DROPDOWN_LEAVE_MS = 260; // 180ms + 2*35ms stagger + margine

  toggleSettingsDropdown(ev?: Event) {
    ev?.stopPropagation();
    if (this.showSettingsDropdown) {
      this.closeSettingsDropdown();
    } else {
      if (this.settingsDropdownLeaveTimer) { clearTimeout(this.settingsDropdownLeaveTimer); this.settingsDropdownLeaveTimer = null; }
      this.settingsDropdownLeaving = false;
      this.showSettingsDropdown = true;
      queueMicrotask(() => this.attachSettingsClickAway());
    }
  }
  closeSettingsDropdown() {
    if (!this.showSettingsDropdown) return;
    this.showSettingsDropdown = false;
    this.detachSettingsClickAway();
    this.settingsDropdownLeaving = true;
    if (this.settingsDropdownLeaveTimer) clearTimeout(this.settingsDropdownLeaveTimer);
    this.settingsDropdownLeaveTimer = setTimeout(() => {
      this.settingsDropdownLeaving = false;
      this.settingsDropdownLeaveTimer = null;
    }, this.SETTINGS_DROPDOWN_LEAVE_MS);
  }
  private settingsClickAwayAttached = false;
  private readonly settingsClickAway = (ev: Event) => {
    if (!this.showSettingsDropdown) return;
    const target = ev.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.punto-settings-dropdown') ||
        target.closest('.settings-menu-btn')) return;
    if (ev.type === 'click') this.closeSettingsDropdown();
  };
  private attachSettingsClickAway() {
    if (this.settingsClickAwayAttached) return;
    document.addEventListener('click', this.settingsClickAway, { capture: true });
    this.settingsClickAwayAttached = true;
  }
  private detachSettingsClickAway() {
    if (!this.settingsClickAwayAttached) return;
    document.removeEventListener('click', this.settingsClickAway, { capture: true } as any);
    this.settingsClickAwayAttached = false;
  }

  openSettings() {
    this.closeSettingsDropdown();
    // Se è aperto l'editor, chiudilo pulitamente prima di mostrare settings
    // (altrimenti lo stato misto confonde header + contenuto).
    if (this.activeNote !== undefined) this.deactivateNote();
    this.settingsOpen = true;
  }

  closeSettings() { this.settingsOpen = false; }

  /** Riceve le notifiche del settings embedded per tenere allineate le
   *  preferenze osservabili (es. calendarShowAllNotes filtra calendarNotes).
   *  Evita il re-read Firestore: update sincrono, nessuna race. */
  onSettingsPreferenceChange(ev: { key: string; value: any }) {
    if (ev.key === 'calendarShowAllNotes') {
      this.calendarShowAllNotes = !!ev.value;
    }
  }

  async onOpenCalendarFilter(): Promise<void> {
    const currentUid = this.authService.getCurrentUserId() ?? undefined;
    const ref = this.dialog.open(CalendarFilterDialogComponent, {
      width: '420px',
      maxWidth: '95vw',
      data: { calendars: this.myCalendars, currentUid },
    });
    ref.componentInstance.prefsChange.subscribe(prefs => {
      this.calendarPref = { showMemos: prefs.showMemos, hiddenCalendarIds: prefs.hiddenCalendarIds };
      this.calendarShowAllNotes = prefs.showAllNotes;
    });
    const result = await firstValueFrom(ref.afterClosed());
    console.log('[DBG-EVT-FILTER] dialog closed', result);

    if (!result?.manage && !(result?.newCalendar || result?.addCalendar) && !result?.unsubscribe) {
      const [updatedPref, updatedShowAll] = await Promise.all([
        this.noteService.getUserPreference<{ showMemos: boolean; hiddenCalendarIds: string[] }>(
          'calendarView',
          { showMemos: true, hiddenCalendarIds: [] }
        ),
        this.noteService.getUserPreference<boolean>('calendarShowAllNotes', false),
      ]);
      this.calendarPref = updatedPref ?? { showMemos: true, hiddenCalendarIds: [] };
      this.calendarShowAllNotes = updatedShowAll ?? false;
    }
    if (result?.manage) {
      const cal = this.myCalendars.find(c => c.id === result.manage);
      if (cal) this.openCalendarManage(cal);
    }
    if (result?.newCalendar || result?.addCalendar) {
      this.openNewCalendarDialog();
    }
    if (result?.unsubscribe) {
      await this.confirmUnsubscribeCalendar(result.unsubscribe);
    }
  }

  private async confirmUnsubscribeCalendar(calId: string): Promise<void> {
    const cal = this.myCalendars.find(c => c.id === calId);
    if (!cal) return;
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        width: '420px', maxWidth: '95vw',
        data: {
          title: this.translationService.instant('CALENDAR.UNSUBSCRIBE'),
          message: this.translationService.instant('CALENDAR.UNSUBSCRIBE_CONFIRM', { name: cal.title }),
          confirmLabel: this.translationService.instant('CALENDAR.UNSUBSCRIBE'),
          cancelLabel: this.translationService.instant('COMMON.CANCEL'),
        },
      }).afterClosed()
    );
    if (!confirmed) return;
    try {
      await this.calendarService.unsubscribeFromCalendar(calId);
      console.log('[DBG-EVT-FILTER] unsubscribed', calId);
      this.myCalendars = this.myCalendars.filter(c => c.id !== calId);
    } catch (err: any) {
      console.error('[DBG-EVT-FILTER] unsubscribe failed', err?.code, err?.message);
      this.toast.show(this.translationService.instant('COMMON.ERROR_GENERIC'));
    }
  }

  private openCalendarManage(cal: Calendar): void {
    const ref = this.dialog.open(CalendarManageDialogComponent, {
      width: '480px',
      maxWidth: '95vw',
      data: { calendar: cal },
    });
    ref.componentInstance.calendarChange.subscribe(({ title, color }: { title: string; color: string }) => {
      this.myCalendars = this.myCalendars.map(c => c.id === cal.id ? { ...c, title, color } : c);
    });
    ref.afterClosed().subscribe(r => {
      console.log('[DBG-EVT-MANAGE] dialog closed', r);
      // UI ottimistica: rimuovi immediatamente il calendar deleted da myCalendars.
      // La subscription getAllVisibleCalendars() ha race condition (Promise.all
      // dentro onSnapshot di getSubscribedCalendars) che a volte ripristina lo
      // stato vecchio. Fix strutturale separato; questa è la riga di sicurezza.
      if (r?.deleted) {
        this.myCalendars = this.myCalendars.filter(c => c.id !== cal.id);
      }
    });
  }

  private openNewCalendarDialog(): void {
    const ref = this.dialog.open(AddCalendarDialogComponent, {
      width: '420px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe(r => {
      console.log('[DBG-EVT-NEW-CAL] dialog closed', r);
      // La subscription getMyCalendars() emetterà automaticamente il nuovo calendar.
    });
  }

  /** Naviga alla vista calendario (bottone header desktop). Chiude eventuali
   *  modi secondari (settings embedded, editor) per tornare allo stato base. */
  goToCalendar() {
    this.settingsOpen = false;
    this.activeNote = undefined;
    this.currentMainView = 'calendar';
  }
  reloadApp() { this.closeSettingsDropdown(); document.location.reload(); }
  logout() {
    this.closeSettingsDropdown();
    this.noteService.clearAESKeyCache();
    this.authService.logout().then(() => this.router.navigate(['/login']));
  }
  /**
   * Apre editor per creare nuova nota/memo/evento.
   * @param type se omesso, deduce dalla view attiva (back-compat pre-FAB speed-dial).
   *             In Fase 1, il CreateFabComponent passa type esplicito.
   */
  openNoteEditor(type?: NoteType) {
    const resolvedType: NoteType = type
      ?? ((this.activeView === 'reminders' || this.mobileNav === 'reminders') ? 'memo' : 'note');

    if (resolvedType === 'memo' || resolvedType === 'event') {
      this.newNoteCalendarDate = this.computeDefaultReminderDate();
    } else {
      this.newNoteCalendarDate = undefined;
    }
    this.newNoteType = resolvedType;
    this.activeNote = null;
  }

  /** Handler emit dal CreateFabComponent speed-dial (creazione nota/memo/evento). */
  async onCreateFab(type: NoteType) {
    if (type === 'event') {
      const calendarId = await this.ensurePersonalCalendar();
      if (!calendarId) {
        return;
      }
      this.newNoteCalendarId = calendarId;
    } else {
      this.newNoteCalendarId = undefined;
    }
    this.openNoteEditor(type);
  }

  /**
   * Restituisce un calendarId owned dall'utente. Se non ne ha → crea
   * silenziosamente "Personale" (isDefault:true) e ritorna il suo id.
   * Usa `getMyCalendars()` (Observable) tramite `firstValueFrom`.
   */
  private async ensurePersonalCalendar(): Promise<string | null> {
    try {
      const owned = await firstValueFrom(this.calendarService.getMyCalendars());
      if (owned.length > 0) {
        const def = owned.find(c => c.isDefault) ?? owned[0];
        return def.id ?? null;
      }
      const newCalId = await this.calendarService.createCalendar({
        title: 'Personale',
        isDefault: true,
      });
      return newCalId ?? null;
    } catch (err) {
      return null;
    }
  }

  /** Handler emit dal CreateFabComponent quando l'utente vuole unirsi a una nota o calendario condiviso. */
  async onJoinShared() {
    const ref = this.dialog.open(JoinByCodeDialogComponent, {
      width: '460px',
      maxWidth: '95vw',
    });
    const result = await firstValueFrom(ref.afterClosed());
    console.log('[DBG-JOIN] dialog closed', result);
    if (result?.kind === 'note' && result.noteId) {
      // La nota condivisa arrivera dal live listener getNotes().
      // Tentiamo di selezionarla subito se e gia in lista, altrimenti
      // aspettiamo la prossima emissione via pendingSelectNoteId.
      const existing = this.allNotes.find(n => n.id === result.noteId);
      if (existing) {
        this.selectNote(existing);
      } else {
        this.pendingSelectNoteId = result.noteId;
      }
    } else if (result?.kind === 'calendar' && result.calendarId) {
      console.log('[DBG-JOIN] subscribed to calendar', result.calendarId);
      // UI ottimistica: leggi il calendar e aggiungilo subito a myCalendars senza
      // aspettare il listener (che può essere bloccato o lento dopo permission-denied
      // su un vecchio snapshot in stato "errored"). La subscription emetterà il dato
      // corretto al prossimo cambio; il push manuale è il safety net.
      try {
        const cal = await this.calendarService.getCalendar(result.calendarId);
        if (cal && !this.myCalendars.some(c => c.id === cal.id)) {
          this.myCalendars = [...this.myCalendars, { ...cal, myRole: 'subscriber' }];
          console.log('[DBG-JOIN] optimistic added to myCalendars', cal.id);
        }
      } catch (err) {
        console.warn('[DBG-JOIN] optimistic getCalendar failed', err);
      }
      this.toast.show(this.translationService.instant('CALENDAR.SUBSCRIBED_TOAST'));
    } else if (result?.joined && result.noteId) {
      // Backward-compat: vecchio shape pre-F.2 (join nota senza kind)
      const existing = this.allNotes.find(n => n.id === result.noteId);
      if (existing) {
        this.selectNote(existing);
      } else {
        this.pendingSelectNoteId = result.noteId;
      }
    }
  }

  private computeDefaultReminderDate(): Date {
    // Sempre oggi + ora corrente + 5 min (arrotondata al multiplo di 5).
    // Non usare calendarCurrentDate: se il calendario è navigato su un altro giorno,
    // il promemoria partirebbe da quella data invece che da oggi.
    const now = new Date(Date.now() + 5 * 60 * 1000);
    const roundedMinutes = Math.ceil(now.getMinutes() / 5) * 5;
    const d = new Date();
    d.setHours(now.getHours());
    if (roundedMinutes >= 60) {
      d.setHours(d.getHours() + 1);
      d.setMinutes(roundedMinutes - 60, 0, 0);
    } else {
      d.setMinutes(roundedMinutes, 0, 0);
    }
    return d;
  }
  openNoteEditorFromCalendar(date?: Date) {
    const now = new Date();
    // Usa la data passata (dal calendario settimana/mese) oppure oggi
    const target = date ?? new Date();
    target.setHours(now.getHours(), now.getMinutes(), 0, 0);
    this.newNoteCalendarDate = target;
    this.activeNote = null;
  }
  selectNote(note: Note) {
    // Se settings era aperto, chiudilo: il click su una nota dalla sidenav
    // esprime l'intenzione di lasciare settings e tornare al flusso note.
    if (this.settingsOpen) this.settingsOpen = false;
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

  closeEditor(note: Partial<Note> | null = null) {
    this.syncViewToNoteType(note);
    this.deactivateNote();
  }
  handleBackButton() {
    if (this.settingsOpen) {
      this.closeSettings();
      return;
    }
    if (this.activeNote !== undefined) {
      const currentNote = this.noteEditorComp?.note ?? null;
      this.syncViewToNoteType(currentNote as Partial<Note> | null);
      this.deactivateNote();
    } else {
      this.currentMainView = 'list';
    }
  }

  private syncViewToNoteType(note?: Partial<Note> | null) {
    console.log('[DBG-EVT-NAV] syncViewToNoteType', { type: note?.type, eventStart: note?.eventStart });
    if (note?.type === 'event' && note.eventStart) {
      // Atterra sul calendar mantenendo la view che l'utente stava usando
      // (month/week/day): cambia solo la data corrente per posizionare il
      // calendario sul giorno dell'evento.
      this.currentMainView = 'calendar';
      this.calendarCurrentDate = new Date(note.eventStart);
      console.log('[DBG-EVT-NAV] applied event view', { calendarCurrentDate: this.calendarCurrentDate.toISOString(), view: this.lastCalendarView });
      if (this.isMobile) this.setMobileNav('calendar');
      return;
    }
    const hasReminder = note?.blocks?.some((b: any) => b.type === 'reminder') ?? false;
    const view = hasReminder ? 'reminders' : 'notes';
    this.activeView = view;
    if (this.isMobile) this.setMobileNav(view);
  }

  private deactivateNote() {
    // Prevent a pending note selection from re-opening the editor after it's been closed
    this.pendingSelectNoteId = null;
    if (this.isMobile) {
      // Su mobile: anima l'uscita, poi rimuove
      this.editorLeaving = true;
      setTimeout(() => {
        this.activeNote = undefined;
        this.newNoteCalendarDate = undefined;
        this.editorLeaving = false;
        this.settingsMenuEnabled = false;
        clearTimeout(this.settingsMenuTimer);
        this.settingsMenuTimer = setTimeout(() => { this.settingsMenuEnabled = true; }, 150);
      }, 220);
    } else {
      this.activeNote = undefined;
      this.newNoteCalendarDate = undefined;
      this.settingsMenuEnabled = false;
      clearTimeout(this.settingsMenuTimer);
      this.settingsMenuTimer = setTimeout(() => { this.settingsMenuEnabled = true; }, 150);
    }
  }
  onCalendarNoteSelected(note: Note) { this.activeNote = note; }

  onNoteCreated(noteId: string) {
    if (this.activeNote !== null) return; // editor already closed/reassigned, don't interfere
    // If the note already landed in allNotes (subscription fired before promise resolved), select it immediately
    const existing = this.allNotes.find(n => n.id === noteId);
    if (existing) {
      this.activeNote = existing;
    } else {
      // Fallback: wait for the next subscription emission
      this.pendingSelectNoteId = noteId;
    }
  }

  onNoteLiveUpdate(update: {id: string, title: string}) {
    const idx = this.allNotes.findIndex(n => n.id === update.id);
    if (idx >= 0) {
      this.allNotes = [
        ...this.allNotes.slice(0, idx),
        { ...this.allNotes[idx], title: update.title },
        ...this.allNotes.slice(idx + 1)
      ];
      this.applyFilter();
    }
  }

  onCalendarCurrentDateChange(date: Date) { this.calendarCurrentDate = date; }

  async setDefaultView(view: 'list' | 'calendar') {
    this.currentMainView = view;
    localStorage.setItem('punto_defaultView', view);
    // Sync mobile toolbar
    if (this.isMobile) {
      if (view === 'calendar') {
        this.setMobileNav('calendar');
      } else {
        this.setMobileNav(this.activeView === 'reminders' ? 'reminders' : 'notes');
      }
      await this.noteService.setUserPreference(this.defaultViewKey, view);
    }
  }

  // ─── Swipe mobile ───────────────────────────────────────────────────────────

  private touchStartX = 0;
  private touchStartY = 0;
  private touchActive = false;

  onTouchStart(e: TouchEvent) {
    // Non catturare swipe che partono dalla toolbar del calendario
    const target = e.target as HTMLElement;
    if (target.closest('.calendar-header') || target.closest('.calendar-toolbar')) {
      this.touchActive = false;
      return;
    }
    this.touchActive = true;
    this.touchStartX = e.touches[0].clientX;
    this.touchStartY = e.touches[0].clientY;
  }

  onTouchEnd(e: TouchEvent) {
    if (!this.isMobile || !this.touchActive) return;
    this.touchActive = false;
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
    // Swipe 3 viste: Note ↔ Promemoria ↔ Calendario (sincronizzato con toolbar)
    if (this.activeNote === undefined) {
      const currentIdx = this.NAV_SEGMENTS.indexOf(this.mobileNav);
      if (deltaX < 0 && currentIdx < this.NAV_SEGMENTS.length - 1) {
        this.setMobileNav(this.NAV_SEGMENTS[currentIdx + 1] as any);
      } else if (deltaX > 0 && currentIdx > 0) {
        this.setMobileNav(this.NAV_SEGMENTS[currentIdx - 1] as any);
      }
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

  /** Dispatcher header mobile: delega a delete o leave in base al ruolo. */
  async deleteOrLeaveActiveNote() {
    if (!this.activeNote?.id) return;
    if (this.activeNote.myRole === 'guest') {
      await this._leaveNote(this.activeNote as Note, true);
    } else {
      await this.deleteActiveNote();
    }
  }

  /** Dispatcher card: delega a delete o leave in base al ruolo. */
  async deleteOrLeaveNote(note: Note, event: Event) {
    event.stopPropagation();
    if (note.myRole === 'guest') {
      await this._leaveNote(note, false);
    } else {
      await this.deleteNote(note, event);
    }
  }

  private async _notifyKickedOut(title: string, ownerUid: string): Promise<void> {
    let username = ownerUid.slice(0, 8);
    if (ownerUid) {
      try {
        const resolved = await this.noteService.getUsernameByUid(ownerUid);
        if (resolved) username = resolved;
      } catch { /* fallback su slice dell'uid */ }
    }
    const key = title ? 'NOTE.REMOVED_BY_OWNER' : 'NOTE.REMOVED_BY_OWNER_NO_TITLE';
    const msg = this.translationService.instant(key, { title, username });
    this.ngZone.run(() => this.toast.show(msg, 5000));
  }

  private async _leaveNote(note: Note, isActiveInEditor: boolean) {
    if (!note.id) return;
    const displayTitle = note.title || this.translationService.instant('NOTE.UNTITLED');
    const ref = this.ngZone.run(() => this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translationService.instant('NOTE.LEAVE_CONFIRM_TITLE'),
        message: this.translationService.instant('NOTE.LEAVE_CONFIRM_MSG', { title: displayTitle }),
        confirmLabel: this.translationService.instant('NOTE.LEAVE')
      }
    }));
    const confirmed = await firstValueFrom(ref.afterClosed());
    if (!confirmed) return;
    try {
      if (isActiveInEditor) this.activeNote = undefined;
      // Segnala al diff-detector che questa scomparsa è volontaria, così non
      // triggera il toast "rimosso dalla nota" oltre a LEAVE_SUCCESS.
      this.voluntaryLeaves.add(note.id);
      await this.noteService.leaveSharedNote(note.id);
      this.ngZone.run(() =>
        this.toast.show(this.translationService.instant('NOTE.LEAVE_SUCCESS'), 3500)
      );
    } catch (e: any) {
      console.error('Errore uscita nota condivisa:', e.message);
      this.voluntaryLeaves.delete(note.id);
    }
  }

  async deleteActiveNote() {
    if (!this.activeNote?.id) return;
    const note = this.activeNote as Note;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: this.translationService.instant('NOTE.DELETE_TITLE'),
        message: this.translationService.instant('NOTE.DELETE_MSG', { title: note.title || this.translationService.instant('NOTE.UNTITLED') }),
        confirmLabel: this.translationService.instant('COMMON.DELETE')
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
        title: this.translationService.instant('NOTE.DELETE_TITLE'),
        message: this.translationService.instant('NOTE.DELETE_MSG', { title: note.title || this.translationService.instant('NOTE.UNTITLED') }),
        confirmLabel: this.translationService.instant('COMMON.DELETE')
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
