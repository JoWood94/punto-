import { Component, inject, signal, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { NoteService } from '../../services/note';
import { ToastService } from '../../services/toast';
import { TranslationService } from '../../services/translation';
import { InviteAcceptDialogComponent } from '../invite-accept-dialog/invite-accept-dialog';
import { firstValueFrom } from 'rxjs';

const SHARE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
// Full code: 8 uppercase chars + dash + 43 base64url chars
const SHARE_CODE_FULL_REGEX = new RegExp(
  `^[${SHARE_CODE_ALPHABET}]{8}-[A-Za-z0-9_-]{43}$`
);

export interface JoinByCodeResult {
  joined: true;
  noteId: string;
}

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
    TranslateModule,
  ],
  templateUrl: './join-by-code-dialog.html',
  styleUrls: ['./join-by-code-dialog.scss'],
})
export class JoinByCodeDialogComponent implements AfterViewInit {
  @ViewChild('codeInput') codeInputRef?: ElementRef<HTMLInputElement>;

  private noteService = inject(NoteService);
  private toastService = inject(ToastService);
  private translationService = inject(TranslationService);
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<JoinByCodeDialogComponent, JoinByCodeResult | null>);

  rawCode = '';
  loading = signal(false);
  errorKey = signal<string | null>(null);

  ngAfterViewInit() {
    // Autofocus senza setTimeout per compatibilita iOS
    this.codeInputRef?.nativeElement.focus();
  }

  get isValid(): boolean {
    if (!this.rawCode.trim()) return false;
    const normalized = this.normalizeCode(this.rawCode.trim());
    return SHARE_CODE_FULL_REGEX.test(normalized);
  }

  /**
   * Normalizza il codice: uppercase per la parte LOOKUP (primi 8 char),
   * preserva il case originale per la parte KEY (case-sensitive base64url).
   */
  normalizeCode(raw: string): string {
    const dashIdx = raw.indexOf('-');
    if (dashIdx === -1) return raw.toUpperCase();
    const lookup = raw.slice(0, dashIdx).toUpperCase();
    const key = raw.slice(dashIdx + 1); // key: preserva case
    return `${lookup}-${key}`;
  }

  onCodeInput() {
    this.errorKey.set(null);
    // Auto-uppercase per la parte LOOKUP mentre si digita
    const input = this.codeInputRef?.nativeElement;
    if (!input) return;
    const val = input.value;
    const dashIdx = val.indexOf('-');
    if (dashIdx === -1) {
      input.value = val.toUpperCase();
      this.rawCode = input.value;
    } else {
      const lookup = val.slice(0, dashIdx).toUpperCase();
      const key = val.slice(dashIdx + 1);
      input.value = `${lookup}-${key}`;
      this.rawCode = input.value;
    }
  }

  async onSubmit() {
    if (!this.isValid || this.loading()) return;
    this.errorKey.set(null);
    this.loading.set(true);

    const normalizedCode = this.normalizeCode(this.rawCode.trim());

    try {
      // Fase 1: fetch metadati per la preview
      const meta = await this.noteService.joinByShareCode(normalizedCode);

      // Mostra preview dialog (riusa InviteAcceptDialogComponent)
      const previewResult = await firstValueFrom(
        this.dialog.open(InviteAcceptDialogComponent, {
          data: {
            ownerUsername: meta.ownerUsername,
            noteTitle: meta.noteTitle || this.translationService.instant('NOTE.UNTITLED'),
            docType: meta.docType as 'note' | 'memo' | 'event' | null,
          },
          width: '420px',
          maxWidth: '95vw',
        }).afterClosed()
      );

      if (!previewResult?.accepted) {
        this.loading.set(false);
        return;
      }

      // Fase 2: conferma join
      const noteId = await this.noteService.confirmJoinByShareCode(normalizedCode, {
        notificationsEnabled: previewResult.notificationsEnabled,
      });

      this.toastService.show(this.translationService.instant('SHARING.JOIN_SUCCESS'), 3000);
      this.dialogRef.close({ joined: true, noteId });
    } catch (e: any) {
      this.loading.set(false);
      const msg = e?.message ?? '';
      if (msg.includes('invalid-code') || msg.includes('malformed')) {
        this.errorKey.set('SHARING.JOIN_INVALID_CODE');
      } else if (msg.includes('not-found') || msg.includes('expired')) {
        this.errorKey.set('SHARING.JOIN_EXPIRED');
      } else if (msg.includes('already-collaborator')) {
        this.errorKey.set('SHARING.JOIN_ALREADY_COLLABORATOR');
      } else if (msg.includes('own-note')) {
        this.errorKey.set('SHARING.JOIN_OWN_NOTE');
      } else {
        this.toastService.show(this.translationService.instant('SHARING.JOIN_ERROR'), 4000);
      }
    }
  }

  cancel() {
    this.dialogRef.close(null);
  }
}
