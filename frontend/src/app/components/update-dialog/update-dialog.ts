import { Component } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-update-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  styles: [`
    .update-dialog-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #1C1B1F;
      color: #FFFBFE;
      margin-bottom: 16px;
      mat-icon { font-size: 24px; width: 24px; height: 24px; line-height: 1; display: flex; align-items: center; justify-content: center; }
    }
    h2[mat-dialog-title] { margin-bottom: 4px; }
  `],
  template: `
    <div mat-dialog-title style="display:flex; flex-direction:column; align-items:flex-start; padding-bottom:0">
      <div class="update-dialog-icon">
        <mat-icon>system_update</mat-icon>
      </div>
      <span>Aggiornamento disponibile</span>
    </div>
    <mat-dialog-content>
      <p style="margin:0; opacity:0.7; font-size:0.95rem; line-height:1.5">
        Una nuova versione di <strong>punto!</strong> è pronta.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="later()">Più tardi</button>
      <button mat-flat-button (click)="update()"
        style="background:#1C1B1F; color:#FFFBFE; border-radius:99px">
        Aggiorna ora
      </button>
    </mat-dialog-actions>
  `
})
export class UpdateDialogComponent {
  constructor(private dialogRef: MatDialogRef<UpdateDialogComponent>) {}

  update() {
    this.dialogRef.close();
    document.location.reload();
  }

  later() {
    this.dialogRef.close();
  }
}
