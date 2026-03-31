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

export interface PassphraseStrength {
  score: number; // 0-4
  label: 'debole' | 'media' | 'forte';
  color: string;
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
        <div class="strength-bar-wrap" [class.visible]="passphrase.length > 0">
          <div class="strength-bar">
            <div class="strength-fill" [style.width.%]="strengthPercent" [style.background]="strength.color"></div>
          </div>
          <span class="strength-label" [style.color]="strength.color">{{ strength.label }}</span>
        </div>

        <ul class="requirements">
          <li [class.met]="req.minLen"><mat-icon>{{ req.minLen ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon> Minimo 8 caratteri</li>
          <li [class.met]="req.upper"><mat-icon>{{ req.upper ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon> Almeno 1 lettera maiuscola</li>
          <li [class.met]="req.number"><mat-icon>{{ req.number ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon> Almeno 1 numero</li>
          <li [class.met]="req.special"><mat-icon>{{ req.special ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon> Almeno 1 carattere speciale (!@#$%^&*...)</li>
        </ul>

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
    .strength-bar-wrap { display: flex; align-items: center; gap: 8px; opacity: 0; transition: opacity .2s; }
    .strength-bar-wrap.visible { opacity: 1; }
    .strength-bar { flex: 1; height: 4px; background: rgba(0,0,0,.12); border-radius: 2px; overflow: hidden; }
    .strength-fill { height: 100%; border-radius: 2px; transition: width .3s, background .3s; }
    .strength-label { font-size: 12px; min-width: 40px; }
    .requirements { list-style: none; padding: 4px 0 0; margin: 0; font-size: 13px; display: flex; flex-direction: column; gap: 4px; }
    .requirements li { display: flex; align-items: center; gap: 6px; color: rgba(0,0,0,.5); }
    .requirements li mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .requirements li.met { color: #2e7d32; }
    .error-message { color: #B3261E; font-size: 13px; margin-top: 4px; }
  `]
})
export class PassphraseDialogComponent {
  passphrase = '';
  confirmPassphrase = '';
  showPassphrase = false;
  showConfirm = false;
  errorMessage = '';

  req = { minLen: false, upper: false, number: false, special: false };
  strength: PassphraseStrength = { score: 0, label: 'debole', color: '#B3261E' };

  constructor(
    public dialogRef: MatDialogRef<PassphraseDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PassphraseDialogData
  ) {}

  get isSetup(): boolean { return this.data.mode === 'setup'; }

  get strengthPercent(): number { return (this.strength.score / 4) * 100; }

  get canConfirm(): boolean {
    if (!this.passphrase) return false;
    if (this.isSetup) {
      const allMet = this.req.minLen && this.req.upper && this.req.number && this.req.special;
      return allMet && this.passphrase === this.confirmPassphrase;
    }
    return true;
  }

  onPassphraseChange() {
    const p = this.passphrase;
    this.req = {
      minLen: p.length >= 8,
      upper: /[A-Z]/.test(p),
      number: /[0-9]/.test(p),
      special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p)
    };
    const score = [this.req.minLen, this.req.upper, this.req.number, this.req.special].filter(Boolean).length;
    const labels: PassphraseStrength['label'][] = ['debole', 'debole', 'media', 'media', 'forte'];
    const colors = ['#B3261E', '#B3261E', '#E65100', '#E65100', '#2e7d32'];
    this.strength = { score, label: labels[score], color: colors[score] };
    this.errorMessage = '';
  }

  setError(msg: string) { this.errorMessage = msg; }

  confirm() { this.dialogRef.close(this.passphrase); }
  cancel() { this.dialogRef.close(null); }
}
