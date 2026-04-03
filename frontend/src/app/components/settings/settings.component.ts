import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { NoteService } from '../../services/note';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatRadioModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatDialogModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  private router = inject(Router);
  private noteService = inject(NoteService);
  private dialog = inject(MatDialog);

  defaultView: 'list' | 'calendar' = 'list';
  notifTitleEnabled = false;

  async ngOnInit() {
    this.defaultView = await this.noteService.getUserPreference<'list' | 'calendar'>('defaultView', 'list');
    this.notifTitleEnabled = await this.noteService.getUserPreference<boolean>('notifTitleEnabled', false);
  }

  goBack() {
    this.router.navigate(['/dashboard']);
  }

  async onDefaultViewChange(value: 'list' | 'calendar') {
    this.defaultView = value;
    await this.noteService.setUserPreference('defaultView', value);
  }

  async onNotifTitleToggle(enabled: boolean) {
    if (enabled) {
      const confirmed = await firstValueFrom(
        this.dialog.open(ConfirmDialogComponent, {
          data: {
            title: 'Titolo nelle notifiche',
            message: 'Attivando questa opzione, il titolo della nota verrà salvato senza cifratura per poter essere incluso nelle notifiche push.',
            confirmLabel: 'Attiva',
            cancelLabel: 'Annulla',
          }
        }).afterClosed()
      );
      if (!confirmed) {
        // Revert toggle
        this.notifTitleEnabled = false;
        return;
      }
    }
    this.notifTitleEnabled = enabled;
    await this.noteService.setUserPreference('notifTitleEnabled', enabled);
  }
}
