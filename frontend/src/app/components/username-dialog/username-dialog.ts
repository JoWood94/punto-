import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';
import { UsernameInputComponent } from '../username-input/username-input';
import { NoteService } from '../../services/note';

@Component({
  selector: 'app-username-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatProgressSpinnerModule, TranslateModule, UsernameInputComponent],
  templateUrl: './username-dialog.html',
  styleUrls: ['./username-dialog.scss']
})
export class UsernameDialogComponent {
  private dialogRef = inject(MatDialogRef<UsernameDialogComponent>);
  private noteService = inject(NoteService);
  private translationService = inject(TranslationService);

  pendingUsername = '';
  usernameValid = false;
  saving = false;
  errorMessage = '';

  onUsernameStateChange(event: { value: string; valid: boolean }) {
    this.pendingUsername = event.value;
    this.usernameValid = event.valid;
    this.errorMessage = '';
  }

  async save() {
    if (!this.usernameValid || this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    try {
      await this.noteService.setUsername(this.pendingUsername);
      this.dialogRef.close(this.pendingUsername);
    } catch {
      this.errorMessage = this.translationService.instant('USERNAME.SAVE_ERROR');
    } finally {
      this.saving = false;
    }
  }
}
