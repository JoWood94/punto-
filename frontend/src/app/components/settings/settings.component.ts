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
import {
  getFirestore, collection, query, where, getDocs, deleteDoc, doc, updateDoc, deleteField
} from 'firebase/firestore';
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

  defaultView: 'list' | 'calendar' = 'list';
  notifTitleEnabled = false;
  resetInProgress = false;

  async ngOnInit() {
    this.defaultView = await this.noteService.getUserPreference<'list' | 'calendar'>('defaultView', 'list');
    this.notifTitleEnabled = await this.noteService.getUserPreference<boolean>('notifTitleEnabled', false);
    this.noteService.setNotifTitleEnabled(this.notifTitleEnabled);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  async onDefaultViewChange(value: 'list' | 'calendar') {
    this.defaultView = value;
    await this.noteService.setUserPreference('defaultView', value);
  }

  async onNotifTitleToggle(enabled: boolean) {
    if (enabled) {
      const confirmed = await firstValueFrom(
        this.dialog.open(ConfirmDialogComponent, {
          data: {
            title: 'Titolo nelle notifiche',
            message: 'Attivando questa opzione, il titolo della nota verrà salvato senza cifratura per poter essere incluso nelle notifiche push.',
            confirmLabel: 'Attiva',
            cancelLabel: 'Annulla',
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

  async confirmResetEncryption() {
    if (this.resetInProgress) return;

    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data: {
          title: 'Reset chiave di cifratura',
          message: 'Questa operazione eliminerà tutte le tue note e resetterà la chiave di cifratura. Non è possibile recuperare i dati. Sei sicuro di voler continuare?',
          confirmLabel: 'Elimina tutto e resetta',
          cancelLabel: 'Annulla',
        }
      }).afterClosed()
    );

    if (!confirmed) return;
    await this.resetEncryption();
  }

  private async resetEncryption(): Promise<void> {
    if (!navigator.onLine) {
      this.snackBar.open('Nessuna connessione. Connettiti e riprova.', 'OK', { duration: 4000 });
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
      this.snackBar.open('Errore durante il reset. Riprova.', 'OK', { duration: 4000 });
    }
  }
}
