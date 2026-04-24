import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { NoteType } from '../../services/note';

@Component({
  selector: 'app-create-fab',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './create-fab.component.html',
  styleUrl: './create-fab.component.scss',
})
export class CreateFabComponent {
  @Input() variant: 'desktop' | 'mobile' = 'desktop';
  @Input() disabled = false;
  /** In Fase 1 l'entita Event non e ancora implementata (arriva in Fase 3/4). */
  @Input() eventsEnabled = false;
  @Output() create = new EventEmitter<NoteType>();
  /** Emesso quando l'utente tocca "Unisciti a una nota". */
  @Output() joinShared = new EventEmitter<void>();

  open = false;

  toggle(): void {
    if (this.disabled) return;
    this.open = !this.open;
  }

  close(): void {
    this.open = false;
  }

  pick(type: NoteType): void {
    this.close();
    this.create.emit(type);
  }

  pickJoin(): void {
    this.close();
    this.joinShared.emit();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open) this.close();
  }
}
