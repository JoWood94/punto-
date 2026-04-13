import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { UsernameInputComponent } from '../username-input/username-input';
import {
  getFirestore, collection, query, where, getDocs, deleteDoc, doc, updateDoc, deleteField
} from 'firebase/firestore';
import { SwUpdate } from '@angular/service-worker';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';
import { NoteService } from '../../services/note';
import { AuthService } from '../../services/auth';
import { CryptoService } from '../../services/crypto';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatRadioModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslateModule,
    UsernameInputComponent,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  private router = inject(Router);
  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  private cryptoService = inject(CryptoService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private swUpdate = inject(SwUpdate);
  private translationService = inject(TranslationService);

  defaultView: 'list' | 'calendar' | 'reminders' = 'list';
  notifTitleEnabled = false;
  calendarShowAllNotes = true;
  resetInProgress = false;
  updateAvailable = false;

  settingsLoaded = false;

  // Username
  currentUsername: string | null = null;
  editingUsername = false;
  pendingUsername = '';
  usernameValid = false;
  savingUsername = false;
  language = 'it';

  async ngOnInit() {
    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.subscribe(event => {
        if (event.type === 'VERSION_READY') this.updateAvailable = true;
      });
    }
    this.language = this.translationService.currentLang;
    this.defaultView = await this.noteService.getUserPreference<'list' | 'calendar' | 'reminders'>('defaultView', 'list');
    this.notifTitleEnabled = await this.noteService.getUserPreference<boolean>('notifTitleEnabled', false);
    this.noteService.setNotifTitleEnabled(this.notifTitleEnabled);
    this.calendarShowAllNotes = await this.noteService.getUserPreference<boolean>('calendarShowAllNotes', true);
    this.currentUsername = await this.noteService.getUsername();
    this.settingsLoaded = true;
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  reloadApp() {
    document.location.reload();
  }

  async onLanguageChange(lang: string) {
    this.language = lang;
    await this.translationService.setLanguage(lang);
  }

  async onDefaultViewChange(value: 'list' | 'calendar' | 'reminders') {
    this.defaultView = value;
    await this.noteService.setUserPreference('defaultView', value);
  }

  async onNotifTitleToggle(enabled: boolean) {
    if (enabled) {
      const confirmed = await firstValueFrom(
        this.dialog.open(ConfirmDialogComponent, {
          data: {
            title: this.translationService.instant('SETTINGS.NOTIF_TITLE_DIALOG_TITLE'),
            message: this.translationService.instant('SETTINGS.NOTIF_TITLE_DIALOG_MSG'),
            confirmLabel: this.translationService.instant('COMMON.ENABLE'),
            cancelLabel: this.translationService.instant('COMMON.CANCEL'),
          }
        }).afterClosed()
      );
      if (!confirmed) {
        this.notifTitleEnabled = false;
        return;
      }
    }
    this.notifTitleEnabled = enabled;
    this.noteService.setNotifTitleEnabled(enabled);
    await this.noteService.setUserPreference('notifTitleEnabled', enabled);
  }

  async onCalendarShowAllNotesToggle(enabled: boolean) {
    this.calendarShowAllNotes = enabled;
    await this.noteService.setUserPreference('calendarShowAllNotes', enabled);
  }

  onUsernameStateChange(event: { value: string; valid: boolean }) {
    this.pendingUsername = event.value;
    this.usernameValid = event.valid;
  }

  async saveUsername() {
    if (!this.usernameValid || this.savingUsername) return;
    this.savingUsername = true;
    try {
      await this.noteService.setUsername(this.pendingUsername);
      this.currentUsername = this.pendingUsername;
      this.editingUsername = false;
      this.snackBar.open(this.translationService.instant('USERNAME.SAVE_SUCCESS'), 'OK', { duration: 3000 });
    } catch {
      this.snackBar.open(this.translationService.instant('USERNAME.SAVE_ERROR'), 'OK', { duration: 4000 });
    } finally {
      this.savingUsername = false;
    }
  }

  async confirmResetEncryption() {
    if (this.resetInProgress) return;

    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: this.translationService.instant('SETTINGS.RESET_ENCRYPTION_DIALOG_TITLE'),
          message: this.translationService.instant('SETTINGS.RESET_ENCRYPTION_DIALOG_MSG'),
          confirmLabel: this.translationService.instant('SETTINGS.DELETE_AND_RESET'),
          cancelLabel: this.translationService.instant('COMMON.CANCEL'),
        }
      }).afterClosed()
    );

    if (!confirmed) return;
    await this.resetEncryption();
  }

  private async resetEncryption(): Promise<void> {
    if (!navigator.onLine) {
      this.snackBar.open(this.translationService.instant('SETTINGS.NO_CONNECTION'), 'OK', { duration: 4000 });
      return;
    }

    const uid = this.authService.getCurrentUserId();
    if (!uid) return;

    this.resetInProgress = true;

    try {
      const db = getFirestore();

      // 1. Cancella tutte le note dell'utente
      const notesSnap = await getDocs(query(collection(db, 'notes'), where('uid', '==', uid)));
      await Promise.all(notesSnap.docs.map(d => deleteDoc(d.ref)));

      // 2. Resetta campi encryption su Firestore
      await updateDoc(doc(db, `users/${uid}`), {
        encryptionEnabled: false,
        encryptionSetup: false,
        publicKey: deleteField()
      });

      // 3. Cancella chiave privata locale (dopo le operazioni Firestore)
      this.cryptoService.clearLocalKey(uid);
      this.cryptoService.clearLocalSessionVersion(uid);

      // 4. Redirect → initEncryption rileva setup mancante e mostra il dialog
      this.router.navigate(['/dashboard'], { replaceUrl: true });

    } catch {
      this.resetInProgress = false;
      this.snackBar.open(this.translationService.instant('SETTINGS.RESET_ERROR'), 'OK', { duration: 4000 });
    }
  }
}
