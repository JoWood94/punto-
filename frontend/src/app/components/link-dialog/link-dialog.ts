import { Component, Inject, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export interface LinkDialogData {
  url: string;
  label: string;
}

export interface LinkDialogResult {
  url: string;
  label: string;
}

@Component({
  selector: 'app-link-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatDialogModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatIconModule
  ],
  templateUrl: './link-dialog.html',
  styleUrls: ['./link-dialog.scss']
})
export class LinkDialogComponent implements AfterViewInit {
  @ViewChild('urlInput') urlInputRef!: ElementRef<HTMLInputElement>;

  constructor(
    public dialogRef: MatDialogRef<LinkDialogComponent, LinkDialogResult | null>,
    @Inject(MAT_DIALOG_DATA) public data: LinkDialogData
  ) {}

  ngAfterViewInit() {
    // Auto-focus sul campo URL dopo animazione apertura dialog
    setTimeout(() => {
      this.urlInputRef?.nativeElement?.focus();
    }, 200);

    // iOS: riposiziona il dialog in base alla tastiera
    // — tastiera aperta → top: 8vh (sopra la tastiera)
    // — tastiera chiusa → centro (comportamento default Material)
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const adjustPosition = () => {
        const keyboardOpen = vv.height < window.screen.height * 0.75;
        this.dialogRef.updatePosition(keyboardOpen ? { top: '8vh' } : {});
      };
      vv.addEventListener('resize', adjustPosition);
      this.dialogRef.afterClosed().subscribe(() => {
        vv.removeEventListener('resize', adjustPosition);
      });
    }
  }

  onUrlPaste(event: ClipboardEvent) {
    // Rimuove spazi iniziali/finali incollati per errore
    setTimeout(() => { this.data.url = this.data.url.trim(); }, 0);
  }

  confirm() {
    if (!this.data.url.trim()) return;
    this.dialogRef.close({ url: this.data.url.trim(), label: this.data.label.trim() });
  }
}
