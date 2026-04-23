import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

export interface InviteAcceptDialogData {
  ownerUsername: string;
  noteTitle: string;
  // Tipo del doc invitato. Se memo/event il guest sceglie se ricevere notifiche (pattern A).
  docType?: 'note' | 'memo' | 'event' | null;
}

export interface InviteAcceptResult {
  accepted: true;
  notificationsEnabled?: boolean;
}

@Component({
  selector: 'app-invite-accept-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule, MatRadioModule, TranslateModule],
  templateUrl: './invite-accept-dialog.html',
  styles: [`
    .invite-notif-consent {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--mat-sys-outline-variant);

      h3 {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 600;
        color: #1C1B1F;
      }

      &__hint {
        margin: 0 0 12px;
        font-size: 13px;
        color: rgba(28, 27, 31, 0.7);
        line-height: 1.4;
      }

      mat-radio-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
    }
  `],
})
export class InviteAcceptDialogComponent {
  notificationsEnabled: boolean = true;

  constructor(
    public dialogRef: MatDialogRef<InviteAcceptDialogComponent, InviteAcceptResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: InviteAcceptDialogData
  ) {}

  get needsNotificationConsent(): boolean {
    return this.data.docType === 'memo' || this.data.docType === 'event';
  }

  accept(): void {
    this.dialogRef.close({
      accepted: true,
      notificationsEnabled: this.needsNotificationConsent ? this.notificationsEnabled : undefined,
    });
  }

  decline(): void {
    this.dialogRef.close(null);
  }
}
