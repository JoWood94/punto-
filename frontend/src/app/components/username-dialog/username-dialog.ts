import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormControl, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
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
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatProgressSpinnerModule, TranslateModule, UsernameInputComponent],
  templateUrl: './username-dialog.html',
  styleUrls: ['./username-dialog.scss']
})
export class UsernameDialogComponent {
  private dialogRef = inject(MatDialogRef<UsernameDialogComponent>);
  private noteService = inject(NoteService);
  private translationService = inject(TranslationService);

  saving = false;
  errorMessage = '';

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

  async save() {
    if (!this.usernameControl.valid || this.saving) return;
    this.saving = true;
    this.errorMessage = '';
    const username = this.usernameControl.value ?? '';
    try {
      await this.noteService.setUsername(username);
      this.dialogRef.close(username);
    } catch {
      this.errorMessage = this.translationService.instant('USERNAME.SAVE_ERROR');
    } finally {
      this.saving = false;
    }
  }
}
