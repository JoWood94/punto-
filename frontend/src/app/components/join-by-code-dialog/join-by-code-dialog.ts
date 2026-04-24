import {
  Component, inject, signal, computed, AfterViewInit, ViewChild, ElementRef, OnDestroy,
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
import { ToastService } from '../../services/toast';
import { TranslationService } from '../../services/translation';

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SHARE_CODE_FULL_REGEX = new RegExp(
  `^[${SHARE_CODE_ALPHABET}]{8}-[A-Za-z0-9_-]{43}$`
);

export interface JoinByCodeResult {
  joined: true;
  noteId: string;
}

type PreviewState = 'idle' | 'loading' | 'ready' | 'error';

@Component({
  selector: 'app-join-by-code-dialog',
  standalone: true,
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
  private toastService = inject(ToastService);
  private translationService = inject(TranslationService);
  private dialogRef = inject(MatDialogRef<JoinByCodeDialogComponent, JoinByCodeResult | null>);

  rawCode = '';

  // Stato preview / submit
  previewState = signal<PreviewState>('idle');
  preview = signal<{ noteTitle: string; ownerUsername: string; docType: string | null } | null>(null);
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
   * Normalizza il codice: uppercase per la parte LOOKUP (8 char),
   * preserva il case originale per la parte KEY (base64url case-sensitive).
   */
  normalizeCode(raw: string): string {
    const dashIdx = raw.indexOf('-');
    if (dashIdx === -1) return raw.toUpperCase();
    return `${raw.slice(0, dashIdx).toUpperCase()}-${raw.slice(dashIdx + 1)}`;
  }

  isValidFormat(code: string): boolean {
    return SHARE_CODE_FULL_REGEX.test(code);
  }

  onCodeInput() {
    // Auto-uppercase in-place per la parte LOOKUP
    const input = this.codeInputRef?.nativeElement;
    if (input) {
      const val = input.value;
      const dashIdx = val.indexOf('-');
      if (dashIdx === -1) {
        input.value = val.toUpperCase();
      } else {
        input.value = `${val.slice(0, dashIdx).toUpperCase()}-${val.slice(dashIdx + 1)}`;
      }
      this.rawCode = input.value;
    }

    // Resetta preview e avvia debounce solo se il formato è completo
    this.preview.set(null);
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
      return;
    }
    try {
      const meta = await this.noteService.joinByShareCode(normalizedCode);
      this.preview.set({
        noteTitle: meta.noteTitle,
        ownerUsername: meta.ownerUsername,
        docType: meta.docType,
      });
      this.previewState.set('ready');
    } catch (e: any) {
      this.preview.set(null);
      this.errorMessage.set(this._mapError(e?.message ?? ''));
      this.previewState.set('error');
    }
  }

  private _mapError(msg: string): string {
    if (msg.includes('invalid-code') || msg.includes('malformed')) {
      return this.translationService.instant('JOIN.ERROR_INVALID');
    }
    if (msg.includes('not-found') || msg.includes('expired')) {
      return this.translationService.instant('JOIN.ERROR_EXPIRED');
    }
    if (msg.includes('already-collaborator')) {
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
    try {
      const noteId = await this.noteService.confirmJoinByShareCode(normalizedCode, {
        notificationsEnabled: this.needsNotificationConsent ? this.notificationsEnabled : undefined,
      });
      this.toastService.show(this.translationService.instant('SHARING.JOIN_SUCCESS'), 3000);
      this.dialogRef.close({ joined: true, noteId });
    } catch (e: any) {
      this.joining.set(false);
      this.errorMessage.set(this._mapError(e?.message ?? ''));
      this.previewState.set('error');
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
