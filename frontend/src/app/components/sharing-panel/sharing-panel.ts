import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule } from '@ngx-translate/core';
import { NoteService, Collaborator, CollaboratorPermissions } from '../../services/note';
import { TranslationService } from '../../services/translation';

interface CollaboratorUI extends Collaborator {
  username: string;
  removing: boolean;
}

@Component({
  selector: 'app-sharing-panel',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule, MatButtonModule, MatIconModule,
    MatSlideToggleModule, MatProgressSpinnerModule, MatDividerModule, MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './sharing-panel.html',
  styleUrls: ['./sharing-panel.scss'],
})
export class SharingPanelComponent implements OnInit {
  private noteService = inject(NoteService);
  translationService = inject(TranslationService);
  private dialogRef = inject(MatDialogRef<SharingPanelComponent>);
  data: { noteId: string } = inject(MAT_DIALOG_DATA);

  loading = signal(true);
  generatingLink = signal(false);
  copyDone = signal(false);
  inviteUrl: string | null = null;
  collaborators: CollaboratorUI[] = [];
  revoking = signal(false);

  private get appBaseUrl(): string {
    const base = document.baseURI;
    return base.endsWith('/') ? base : base + '/';
  }

  async ngOnInit() {
    await Promise.all([
      this.loadCollaborators(),
      this.loadActiveInvite(),
    ]);
    this.loading.set(false);
  }

  private async loadActiveInvite() {
    const token = await this.noteService.getActiveInvite(this.data.noteId);
    if (token) {
      this.inviteUrl = `${this.appBaseUrl}#/dashboard?invite=${token}`;
    }
  }

  private async loadCollaborators() {
    const list = await this.noteService.getCollaborators(this.data.noteId);
    this.collaborators = await Promise.all(
      list.map(async c => ({
        ...c,
        username: (await this.noteService.getUsernameByUid(c.uid)) ?? c.uid,
        removing: false,
      }))
    );
  }

  async generateLink() {
    this.generatingLink.set(true);
    try {
      const token = await this.noteService.createInvite(this.data.noteId);
      this.inviteUrl = `${this.appBaseUrl}#/dashboard?invite=${token}`;
    } finally {
      this.generatingLink.set(false);
    }
  }

  async copyLink() {
    if (!this.inviteUrl) return;
    await navigator.clipboard.writeText(this.inviteUrl);
    this.copyDone.set(true);
    setTimeout(() => this.copyDone.set(false), 2000);
  }

  async togglePermission(collab: CollaboratorUI, perm: keyof CollaboratorPermissions) {
    collab.permissions = { ...collab.permissions, [perm]: !collab.permissions[perm] };
    await this.noteService.updateCollaboratorPermissions(this.data.noteId, collab.uid, collab.permissions);
  }

  async removeCollaborator(collab: CollaboratorUI) {
    collab.removing = true;
    try {
      await this.noteService.removeCollaborator(this.data.noteId, collab.uid);
      this.collaborators = this.collaborators.filter(c => c.uid !== collab.uid);
    } catch {
      collab.removing = false;
    }
  }

  async revokeAll() {
    this.revoking.set(true);
    try {
      await this.noteService.revokeAllCollaborators(this.data.noteId);
      this.collaborators = [];
      this.inviteUrl = null;
      this.dialogRef.close({ revoked: true });
    } finally {
      this.revoking.set(false);
    }
  }
}
