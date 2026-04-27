import {
  Component, inject, signal, AfterViewInit, ViewChild, ElementRef, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, debounceTime, takeUntil } from 'rxjs';
import { NoteService } from '../../services/note';
import { CalendarService } from '../../services/calendar';
import { ToastService } from '../../services/toast';
import { TranslationService } from '../../services/translation';

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Codice note: 8 char lookup + trattino + 43 char key (base64url). */
const NOTE_CODE_REGEX = new RegExp(
  `^[${SHARE_CODE_ALPHABET}]{8}-[A-Za-z0-9_-]{43}$`
);
/** Token calendario: 8 char unambiguous-base32 UPPERCASE (stesso alfabeto NOTE).
 *  La rule Firestore `invites.create` enforce questo pattern via isValidLookup. */
const CALENDAR_TOKEN_REGEX = new RegExp(`^[${SHARE_CODE_ALPHABET}]{8}$`);

export interface JoinByCodeResult {
  kind: 'note' | 'calendar';
  noteId?: string;
  calendarId?: string;
  /** @deprecated backward-compat shape pre-F.2 */
  joined?: true;
}

type PreviewState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-join-by-code-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    TranslateModule,
  ],
  templateUrl: './join-by-code-dialog.html',
  styleUrls: ['./join-by-code-dialog.scss'],
})
export class JoinByCodeDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('codeInput') codeInputRef?: ElementRef<HTMLInputElement>;

  private noteService = inject(NoteService);
  private calendarService = inject(CalendarService);
  private toastService = inject(ToastService);
  private translationService = inject(TranslationService);
  private cdr = inject(ChangeDetectorRef);
  private dialogRef = inject(MatDialogRef<JoinByCodeDialogComponent, JoinByCodeResult | null>);

  rawCode = '';

  // Stato preview / submit
  previewState = signal<PreviewState>('idle');
  preview = signal<{ noteTitle: string; ownerUsername: string; docType: string | null } | null>(null);
  calendarTitle = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  joining = signal(false);

  // Consenso notifiche (visibile solo per memo/event)
  notificationsEnabled = true;

  // Debounce: ogni modifica del codice passa per questo Subject
  private readonly codeChange$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  get isReady(): boolean {
    return this.previewState() === 'ready';
  }

  get needsNotificationConsent(): boolean {
    const dt = this.preview()?.docType;
    return dt === 'memo' || dt === 'event';
  }

  // Il bottone Unisciti è abilitato solo quando la preview è caricata
  // e non è in corso un join
  get canSubmit(): boolean {
    return this.isReady && !this.joining();
  }

  constructor() {
    // Debounce 300ms: parte il fetch solo quando il codice smette di cambiare
    this.codeChange$.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
    ).subscribe(code => this._fetchPreview(code));
  }

  ngAfterViewInit() {
    this.codeInputRef?.nativeElement.focus();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Normalizza il codice:
   * - Note code: uppercase per la parte LOOKUP (8 char), preserva il case per la KEY.
   * - Calendar token: 8 char unambiguous-base32 UPPERCASE → uppercase whole.
   */
  normalizeCode(raw: string): string {
    const trimmed = raw.trim();
    const dashIdx = trimmed.indexOf('-');
    if (dashIdx === -1) return trimmed.toUpperCase(); // calendar token: tutto upper
    return `${trimmed.slice(0, dashIdx).toUpperCase()}-${trimmed.slice(dashIdx + 1)}`;
  }

  isValidFormat(code: string): boolean {
    return NOTE_CODE_REGEX.test(code) || CALENDAR_TOKEN_REGEX.test(code);
  }

  isNoteCode(code: string): boolean {
    return NOTE_CODE_REGEX.test(code);
  }

  isCalendarToken(code: string): boolean {
    return CALENDAR_TOKEN_REGEX.test(code);
  }

  /**
   * Estrae il token Firestore dall'input:
   * - Note code: lookup (8 char prima del trattino) → usato da peekInvite
   * - Calendar token: il token intero (20 char) → usato da peekInvite e subscribeToCalendar
   */
  private _extractLookup(normalizedCode: string): string {
    if (this.isCalendarToken(normalizedCode)) return normalizedCode;
    const dashIdx = normalizedCode.indexOf('-');
    return dashIdx === -1 ? normalizedCode : normalizedCode.slice(0, dashIdx);
  }

  onCodeInput() {
    // Auto-uppercase della parte LOOKUP solo per codici nota (con trattino)
    const input = this.codeInputRef?.nativeElement;
    if (input) {
      const val = input.value;
      const dashIdx = val.indexOf('-');
      if (dashIdx !== -1) {
        // Note code: uppercase il LOOKUP, preserva la KEY
        input.value = `${val.slice(0, dashIdx).toUpperCase()}-${val.slice(dashIdx + 1)}`;
      }
      // Calendar token: nessun auto-uppercase (case-sensitive)
      this.rawCode = input.value;
    }

    // Resetta preview e avvia debounce solo se il formato è completo
    this.preview.set(null);
    this.calendarTitle.set(null);
    this.errorMessage.set(null);
    const normalized = this.normalizeCode(this.rawCode.trim());
    if (this.isValidFormat(normalized)) {
      this.previewState.set('loading');
      this.codeChange$.next(normalized);
    } else {
      this.previewState.set('idle');
    }
  }

  private async _fetchPreview(normalizedCode: string) {
    // Doppio check: l'utente potrebbe aver continuato a digitare nel debounce
    if (!this.isValidFormat(normalizedCode)) {
      this.previewState.set('idle');
      this.cdr.markForCheck();
      return;
    }
    try {
      if (this.isCalendarToken(normalizedCode)) {
        // Token calendario puro: verifica existence tramite peekInvite
        const peek = await this.noteService.peekInvite(normalizedCode);
        console.log('[DBG-JOIN] peek (calendar token)', peek);
        this.calendarTitle.set(peek.title ?? null);
        this.preview.set({ noteTitle: '', ownerUsername: '', docType: 'calendar' });
        this.previewState.set('ready');
      } else {
        // Note code (LOOKUP-KEY): peek + preview ricca
        const lookup = this._extractLookup(normalizedCode);
        const peek = await this.noteService.peekInvite(lookup);
        console.log('[DBG-JOIN] peek', peek);

        if (peek.type === 'calendar') {
          // Calendario condiviso via codice note-style (eventuali future implementazioni)
          this.calendarTitle.set(peek.title ?? null);
          this.preview.set({ noteTitle: '', ownerUsername: '', docType: 'calendar' });
          this.previewState.set('ready');
        } else {
          // Path nota: usa joinByShareCode per la preview ricca (titolo + owner)
          const meta = await this.noteService.joinByShareCode(normalizedCode);
          this.preview.set({
            noteTitle: meta.noteTitle,
            ownerUsername: meta.ownerUsername,
            docType: meta.docType,
          });
          this.previewState.set('ready');
        }
      }
    } catch (e: any) {
      this.preview.set(null);
      this.calendarTitle.set(null);
      this.errorMessage.set(this._mapError(e?.message ?? ''));
      this.previewState.set('error');
    }
    this.cdr.markForCheck();
  }

  private _mapError(msg: string): string {
    if (msg.includes('invalid-code') || msg.includes('malformed')) {
      return this.translationService.instant('JOIN.ERROR_INVALID');
    }
    if (msg.includes('not-found') || msg.includes('expired')) {
      return this.translationService.instant('JOIN.ERROR_EXPIRED');
    }
    if (msg.includes('already-collaborator') || msg.includes('already-subscribed') || msg.includes('already subscribed')) {
      return this.translationService.instant('JOIN.ERROR_ALREADY_IN');
    }
    if (msg.includes('own-note')) {
      return this.translationService.instant('JOIN.ERROR_OWN_NOTE');
    }
    return this.translationService.instant('JOIN.ERROR_GENERIC');
  }

  async onSubmit() {
    if (!this.canSubmit) return;
    const normalizedCode = this.normalizeCode(this.rawCode.trim());
    this.joining.set(true);
    this.cdr.markForCheck();
    try {
      if (this.isCalendarToken(normalizedCode)) {
        // Calendar token: subscribeToCalendar usa il token direttamente
        const calId = await this.calendarService.subscribeToCalendar(normalizedCode);
        console.log('[DBG-JOIN] calendar subscribed', calId);
        this.dialogRef.close({ kind: 'calendar', calendarId: calId });
      } else {
        // Note code (LOOKUP-KEY): peek per sicurezza, poi dispatch
        const lookup = this._extractLookup(normalizedCode);
        const peek = await this.noteService.peekInvite(lookup);
        console.log('[DBG-JOIN] peek', peek);

        if (peek.type === 'calendar') {
          // Il lookup è di tipo calendario (edge case)
          const calId = await this.calendarService.subscribeToCalendar(lookup);
          console.log('[DBG-JOIN] calendar subscribed (via lookup)', calId);
          this.dialogRef.close({ kind: 'calendar', calendarId: calId });
        } else {
          // Path nota: usa confirmJoinByShareCode con opzioni notifiche
          const noteId = await this.noteService.confirmJoinByShareCode(normalizedCode, {
            notificationsEnabled: this.needsNotificationConsent ? this.notificationsEnabled : undefined,
          });
          this.toastService.show(this.translationService.instant('SHARING.JOIN_SUCCESS'), 3000);
          console.log('[DBG-JOIN] note joined', noteId);
          this.dialogRef.close({ kind: 'note', noteId });
        }
      }
    } catch (e: any) {
      console.error('[DBG-JOIN] error', e);
      this.joining.set(false);
      this.errorMessage.set(this._mapError(e?.message ?? ''));
      this.previewState.set('error');
      this.cdr.markForCheck();
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
