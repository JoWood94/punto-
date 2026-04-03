import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface PassphraseDialogData {
  mode: 'setup' | 'unlock';
}

@Component({
  selector: 'app-passphrase-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ isSetup ? 'Proteggi le tue note' : 'Sblocca le tue note' }}</h2>

    <mat-dialog-content>
      <p class="dialog-hint">
        {{ isSetup
          ? 'Questa passphrase cifra le tue note. Non è recuperabile — conservala in un posto sicuro.'
          : 'Inserisci la passphrase per accedere alle tue note cifrate.' }}
      </p>

      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Passphrase</mat-label>
        <input matInput
          [(ngModel)]="passphrase"
          [type]="showPassphrase ? 'text' : 'password'"
          (ngModelChange)="onPassphraseChange()"
          autocomplete="new-password" />
        <button mat-icon-button matSuffix type="button" (click)="showPassphrase = !showPassphrase">
          <mat-icon>{{ showPassphrase ? 'visibility_off' : 'visibility' }}</mat-icon>
        </button>
      </mat-form-field>

      @if (isSetup) {
        <mat-form-field appearance="outline" class="full-width" style="margin-top: 8px;">
          <mat-label>Conferma passphrase</mat-label>
          <input matInput
            [(ngModel)]="confirmPassphrase"
            [type]="showConfirm ? 'text' : 'password'"
            autocomplete="new-password" />
          <button mat-icon-button matSuffix type="button" (click)="showConfirm = !showConfirm">
            <mat-icon>{{ showConfirm ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          @if (confirmPassphrase && passphrase !== confirmPassphrase) {
            <mat-hint style="color: var(--mdc-filled-text-field-error-active-indicator-color, #B3261E)">Le passphrase non coincidono</mat-hint>
          }
        </mat-form-field>
      }

      @if (errorMessage) {
        <p class="error-message">{{ errorMessage }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()">Annulla</button>
      <button mat-flat-button (click)="confirm()" [disabled]="!canConfirm">
        {{ isSetup ? 'Imposta' : 'Sblocca' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    mat-dialog-content { display: flex; flex-direction: column; gap: 4px; padding-top: 8px; }
    .full-width { width: 100%; }
    .dialog-hint { font-size: 13px; color: rgba(0,0,0,.6); margin-bottom: 8px; }
    .error-message { color: #B3261E; font-size: 13px; margin-top: 4px; }
  `]
})
export class PassphraseDialogComponent {
  passphrase = '';
  confirmPassphrase = '';
  showPassphrase = false;
  showConfirm = false;
  errorMessage = '';

  constructor(
    public dialogRef: MatDialogRef<PassphraseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PassphraseDialogData
  ) {}

  get isSetup(): boolean { return this.data.mode === 'setup'; }

  get canConfirm(): boolean {
    if (!this.passphrase) return false;
    if (this.isSetup) return this.passphrase === this.confirmPassphrase;
    return true;
  }

  onPassphraseChange() { this.errorMessage = ''; }

  setError(msg: string) { this.errorMessage = msg; }

  confirm() { this.dialogRef.close(this.passphrase); }
  cancel() { this.dialogRef.close(null); }
}
