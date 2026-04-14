import { Component, Optional, Self, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, NgControl, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { TranslationService } from '../../services/translation';

@Component({
  selector: 'app-username-input',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressSpinnerModule, TranslateModule],
  templateUrl: './username-input.html',
  styleUrls: ['./username-input.scss']
})
export class UsernameInputComponent implements ControlValueAccessor {
  private translationService = inject(TranslationService);

  value = '';

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(@Optional() @Self() public ngControl: NgControl) {
    if (ngControl) ngControl.valueAccessor = this;
  }

  writeValue(val: string): void {
    this.value = val ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  onInput(event: Event) {
    const el = event.target as HTMLInputElement;
    const sanitized = el.value.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitized !== el.value) el.value = sanitized;
    this.value = sanitized;
    this.onChange(sanitized);
  }

  onBlur() {
    this.onTouched();
  }

  get isPending(): boolean { return this.ngControl?.status === 'PENDING'; }
  get isAvailable(): boolean { return this.ngControl?.status === 'VALID' && !!this.value; }
  get isTaken(): boolean { return !!this.ngControl?.errors?.['taken']; }
  get isInvalid(): boolean {
    const e = this.ngControl?.errors;
    return !!e?.['pattern'] || !!e?.['invalid'] || !!e?.['minlength'];
  }

  get hintText(): string {
    const t = this.translationService;
    if (!this.value) return t.instant('USERNAME.HINT_IDLE');
    if (this.isPending) return t.instant('USERNAME.HINT_CHECKING');
    if (this.isAvailable) return t.instant('USERNAME.HINT_AVAILABLE', { username: this.value });
    if (this.isTaken) return t.instant('USERNAME.HINT_TAKEN', { username: this.value });
    if (this.isInvalid) return t.instant('USERNAME.HINT_INVALID');
    return t.instant('USERNAME.HINT_IDLE');
  }
}
