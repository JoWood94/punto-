import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

export interface EventReminderCustomDialogData {
  eventStart: number;
}

export interface EventReminderCustomDialogResult {
  offsetMin: number;
}

/**
 * Dialog "Personalizza promemoria": l'utente sceglie data+ora esatta a cui
 * vuole ricevere il reminder. Il delta con eventStart diventa l'offset salvato
 * nel sub-doc eventReminders. Vincoli: la datetime deve essere precedente o
 * uguale a eventStart, e non più di 30 giorni prima.
 */
@Component({
  selector: 'app-event-reminder-custom-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslateModule],
  template: `
    <h2 mat-dialog-title>{{ 'EVENT.REMINDER_CUSTOM_TITLE' | translate }}</h2>
    <mat-dialog-content>
      <p class="hint">{{ 'EVENT.REMINDER_CUSTOM_HINT' | translate }}</p>
      <mat-form-field appearance="outline" class="full">
        <input matInput type="datetime-local" [(ngModel)]="dtLocal" [max]="maxLocal">
      </mat-form-field>
      <p class="error" *ngIf="error">{{ error | translate }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">{{ 'COMMON.CANCEL' | translate }}</button>
      <button mat-flat-button color="primary" (click)="onOk()">{{ 'COMMON.OK' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .full { width: 100%; }
    .hint { margin: 0 0 12px; color: var(--punto-on-surface-variant, #555); font-size: 14px; }
    .error { margin: 4px 0 0; color: #b3261e; font-size: 13px; }
  `],
})
export class EventReminderCustomDialogComponent {
  dtLocal: string;
  maxLocal: string;
  error: string | null = null;

  constructor(
    private dialogRef: MatDialogRef<EventReminderCustomDialogComponent, EventReminderCustomDialogResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: EventReminderCustomDialogData
  ) {
    // Default: 1 ora prima dell'evento, oppure ora-1h se evento è troppo vicino.
    const defaultMs = Math.max(Date.now(), data.eventStart - 60 * 60 * 1000);
    this.dtLocal = this.toLocalInput(defaultMs);
    this.maxLocal = this.toLocalInput(data.eventStart);
  }

  onCancel(): void { this.dialogRef.close(null); }

  onOk(): void {
    if (!this.dtLocal) { this.error = 'EVENT.REMINDER_CUSTOM_INVALID'; return; }
    const ms = new Date(this.dtLocal).getTime();
    if (!isFinite(ms)) { this.error = 'EVENT.REMINDER_CUSTOM_INVALID'; return; }
    if (ms > this.data.eventStart) { this.error = 'EVENT.REMINDER_CUSTOM_AFTER'; return; }
    const offsetMin = Math.round((this.data.eventStart - ms) / 60_000);
    if (offsetMin < 0 || offsetMin > 60 * 24 * 30) { this.error = 'EVENT.REMINDER_CUSTOM_OUT_OF_RANGE'; return; }
    this.dialogRef.close({ offsetMin });
  }

  private toLocalInput(ms: number): string {
    const d = new Date(ms);
    // YYYY-MM-DDTHH:mm in local timezone
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
