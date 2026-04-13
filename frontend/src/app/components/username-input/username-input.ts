import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { NoteService } from '../../services/note';
import { TranslationService } from '../../services/translation';

export type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

@Component({
  selector: 'app-username-input',
  standalone: true,
  imports: [CommonModule, FormsModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressSpinnerModule, TranslateModule],
  templateUrl: './username-input.html',
  styleUrls: ['./username-input.scss']
})
export class UsernameInputComponent implements OnInit, OnDestroy {
  @Input() initialValue = '';
  @Output() stateChange = new EventEmitter<{ value: string; valid: boolean }>();

  value = '';
  state: UsernameState = 'idle';

  private noteService = inject(NoteService);
  private translationService = inject(TranslationService);
  private input$ = new Subject<string>();
  private destroy$ = new Subject<void>();

  ngOnInit() {
    if (this.initialValue) {
      this.value = this.initialValue;
    }

    this.input$.pipe(
      debounceTime(1500),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(v => this.validate(v));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onInput(event: Event) {
    const el = event.target as HTMLInputElement;

    // Strip any character that is not alphanumeric or underscore — blocks @, spaces, -, emoji, etc.
    const sanitized = el.value.replace(/[^a-zA-Z0-9_]/g, '');
    if (sanitized !== el.value) {
      el.value = sanitized;
    }

    this.value = sanitized;

    if (!sanitized) {
      this.state = 'idle';
      this.stateChange.emit({ value: sanitized, valid: false });
      return;
    }
    if (!NoteService.validateUsernameFormat(sanitized)) {
      this.state = 'invalid';
      this.stateChange.emit({ value: sanitized, valid: false });
      return;
    }
    this.state = 'checking';
    this.stateChange.emit({ value: sanitized, valid: false });
    this.input$.next(sanitized);
  }

  private async validate(value: string) {
    if (!NoteService.validateUsernameFormat(value)) {
      this.state = 'invalid';
      this.stateChange.emit({ value, valid: false });
      return;
    }
    try {
      const available = await this.noteService.checkUsernameAvailability(value);
      this.state = available ? 'available' : 'taken';
      this.stateChange.emit({ value, valid: available });
    } catch {
      this.state = 'idle';
      this.stateChange.emit({ value, valid: false });
    }
  }

  get hintText(): string {
    const t = this.translationService;
    switch (this.state) {
      case 'idle':      return t.instant('USERNAME.HINT_IDLE');
      case 'checking':  return t.instant('USERNAME.HINT_CHECKING');
      case 'available': return t.instant('USERNAME.HINT_AVAILABLE', { username: this.value });
      case 'taken':     return t.instant('USERNAME.HINT_TAKEN', { username: this.value });
      case 'invalid':   return t.instant('USERNAME.HINT_INVALID');
    }
  }
}
