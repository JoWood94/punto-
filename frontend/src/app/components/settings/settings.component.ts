import { Component, EventEmitter, HostBinding, inject, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ToastService } from '../../services/toast';
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
    ReactiveFormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatRadioModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatDialogModule,
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
  private toast = inject(ToastService);
  private swUpdate = inject(SwUpdate);
  private translationService = inject(TranslationService);

  /** Quando true il componente è renderizzato dentro la shell del dashboard:
   *  nasconde la mat-toolbar interna (l'header applicativo del dashboard resta
   *  quello visibile) ed emette backRequest invece di router.navigate sul back. */
  @Input() embedded = false;
  @Output() backRequest = new EventEmitter<void>();
  /** Notifica il parent (dashboard) che una preferenza osservabile è cambiata.
   *  Evita di dover ri-leggere da Firestore al close: il parent aggiorna il
   *  proprio stato sincrono ricevendo la coppia {key,value}. */
  @Output() preferenceChange = new EventEmitter<{ key: string; value: any }>();

  @HostBinding('class.embedded') get _hostEmbedded() { return this.embedded; }

  defaultView: 'list' | 'calendar' | 'reminders' = 'list';
  notifTitleEnabled = false;
  calendarShowAllNotes = false;
  resetInProgress = false;
  updateAvailable = false;

  settingsLoaded = false;

  // Username
  currentUsername: string | null = null;
  editingUsername = false;
  savingUsername = false;
  language = 'it';

  private _usernameTimer: ReturnType<typeof setTimeout> | null = null;

  private usernameAsyncValidator = (control: AbstractControl): Promise<ValidationErrors | null> => {
    return new Promise(resolve => {
      if (this._usernameTimer) clearTimeout(this._usernameTimer);
      this._usernameTimer = setTimeout(async () => {
        const v = control.value as string;
        if (!v || !NoteService.validateUsernameFormat(v)) {
          resolve({ invalid: true });
          return;
        }
        try {
          const available = await this.noteService.checkUsernameAvailability(v);
          resolve(available ? null : { taken: true });
        } catch {
          resolve(null);
        }
      }, 1500);
    });
  };

  usernameControl = new FormControl('', [
    Validators.required,
    Validators.pattern(/^[a-zA-Z0-9][a-zA-Z0-9_]{1,18}[a-zA-Z0-9]$/)
  ], [this.usernameAsyncValidator]);

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
    this.calendarShowAllNotes = await this.noteService.getUserPreference<boolean>('calendarShowAllNotes', false);
    this.currentUsername = await this.noteService.getUsername();
    this.settingsLoaded = true;
  }

  goBack() {
    if (this.embedded) {
      this.backRequest.emit();
    } else {
      this.router.navigate(['/dashboard']);
    }
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
    // Propaga al parent embedded così il calendario aggiorna subito il filtro.
    this.preferenceChange.emit({ key: 'calendarShowAllNotes', value: enabled });
  }

  startEditUsername() {
    this.usernameControl.setValue(this.currentUsername || '');
    this.editingUsername = true;
  }

  async saveUsername() {
    if (!this.usernameControl.valid || this.savingUsername) return;
    this.savingUsername = true;
    const username = this.usernameControl.value ?? '';
    try {
      await this.noteService.setUsername(username);
      this.currentUsername = username;
      this.editingUsername = false;
      this.toast.show(this.translationService.instant('USERNAME.SAVE_SUCCESS'), 3000);
    } catch {
      this.toast.show(this.translationService.instant('USERNAME.SAVE_ERROR'));
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
      this.toast.show(this.translationService.instant('SETTINGS.NO_CONNECTION'));
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
      this.toast.show(this.translationService.instant('SETTINGS.RESET_ERROR'));
    }
  }
}
