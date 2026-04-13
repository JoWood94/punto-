import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

export interface InviteAcceptDialogData {
  ownerUsername: string;
  noteTitle: string;
}

@Component({
  selector: 'app-invite-accept-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './invite-accept-dialog.html',
})
export class InviteAcceptDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<InviteAcceptDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: InviteAcceptDialogData
  ) {}
}
