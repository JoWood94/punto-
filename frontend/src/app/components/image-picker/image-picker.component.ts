import {
  Component, Input, Output, EventEmitter, inject, signal,
  ChangeDetectionStrategy, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { ImageProcessorService } from '../../services/image-processor.service';

/** Stato interno del picker. */
type PickerState = 'empty' | 'uploading' | 'loaded' | 'error';

/** Messaggio di errore strutturato. */
interface PickerError {
  /** Chiave i18n da mostrare. */
  key: string;
}

/**
 * Componente standalone per la selezione, compressione e preview di un'immagine.
 *
 * Utilizzo:
 *   <app-image-picker
 *     [value]="note.image ?? null"
 *     [placeholder]="'IMAGE.ADD' | translate"
 *     (valueChange)="onImageChange($event)">
 *   </app-image-picker>
 *
 * Emette null su rimozione. Non salva nulla: delega il salvataggio all'host.
 */
@Component({
  selector: 'app-image-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, MatIconModule, MatButtonModule, TranslateModule],
  templateUrl: './image-picker.component.html',
  styleUrls: ['./image-picker.component.scss'],
})
export class ImagePickerComponent {
  /** Immagine corrente (proveniente dal doc Firestore). */
  @Input() set value(v: { data: string; mimeType: string } | null | undefined) {
    this._value = v ?? null;
    this.state.set(v ? 'loaded' : 'empty');
    this.error.set(null);
  }
  get value(): { data: string; mimeType: string } | null { return this._value; }

  /**
   * Testo del bottone nell'empty state.
   * Default: chiave i18n IMAGE.ADD — l'host può passare IMAGE.ADD_COVER per eventi.
   */
  @Input() placeholder = 'IMAGE.ADD';

  /** Emette il nuovo valore (data URL + mimeType) o null su rimozione. */
  @Output() valueChange = new EventEmitter<{ data: string; mimeType: string } | null>();

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  readonly state = signal<PickerState>('empty');
  readonly error = signal<PickerError | null>(null);

  private _value: { data: string; mimeType: string } | null = null;
  private imageProcessor = inject(ImageProcessorService);

  /** Apre il selettore file nativo. */
  openPicker(): void {
    this.fileInputRef?.nativeElement.click();
  }

  /** Handler sul change dell'input file. */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Reset input per permettere ri-selezione dello stesso file
    input.value = '';
    if (!file) return;

    this.state.set('uploading');
    this.error.set(null);

    try {
      const compressed = await this.imageProcessor.compressImage(file);
      this._value = { data: compressed.data, mimeType: compressed.mimeType };
      this.state.set('loaded');
      this.valueChange.emit(this._value);
    } catch (err: any) {
      this.state.set('error');
      const key = this.resolveErrorKey(err?.message ?? '');
      this.error.set({ key });
    }
  }

  /** Rimuove l'immagine. */
  remove(): void {
    this._value = null;
    this.state.set('empty');
    this.error.set(null);
    this.valueChange.emit(null);
  }

  /** Torna allo stato empty dal error per permettere un nuovo tentativo. */
  retry(): void {
    this.state.set('empty');
    this.error.set(null);
  }

  /** Mappa il codice errore del service alla chiave i18n. */
  private resolveErrorKey(errorMessage: string): string {
    if (errorMessage === 'TOO_LARGE') return 'IMAGE.TOO_LARGE';
    if (errorMessage === 'HEIC_UNSUPPORTED') return 'IMAGE.HEIC_UNSUPPORTED';
    return 'IMAGE.UNSUPPORTED_FORMAT';
  }
}
