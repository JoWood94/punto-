import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
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
import { AuthService } from '../../services/auth';

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
export class SharingPanelComponent implements OnInit, OnDestroy {
  private noteService = inject(NoteService);
  private authService = inject(AuthService);
  translationService = inject(TranslationService);
  private dialogRef = inject(MatDialogRef<SharingPanelComponent>);
  data: { noteId: string; myRole?: 'owner' | 'guest'; ownerUid?: string } = inject(MAT_DIALOG_DATA);

  loading = signal(true);
  generatingLink = signal(false);
  copyDone = signal(false);
  leaving = signal(false);
  inviteUrl: string | null = null;
  inviteToken: string | null = null;   // token Firestore (id documento) dell'invite attivo
  collaborators: CollaboratorUI[] = [];
  revoking = signal(false);
  ownerUsername: string | null = null;
  private collabUnsub: (() => void) | null = null;

  get isGuest(): boolean {
    return this.data.myRole === 'guest';
  }

  get currentUserId(): string | null {
    return this.authService.getCurrentUserId();
  }

  private get appBaseUrl(): string {
    const base = document.baseURI;
    return base.endsWith('/') ? base : base + '/';
  }

  async ngOnInit() {
    if (this.isGuest) {
      await Promise.all([
        this.loadCollaborators(),
        this.loadOwnerUsername(),
      ]);
      this.loading.set(false);
    } else {
      // Cleanup asincrono degli inviti scaduti — fire-and-forget, non blocca il caricamento
      this.noteService.cleanupExpiredInvites(this.data.noteId).catch(() => {});
      await this.loadActiveInvite();
      // Live watcher: aggiorna la lista collaboratori in tempo reale
      this.collabUnsub = this.noteService.watchCollaborators(this.data.noteId, async (rawCollabs) => {
        this.collaborators = await Promise.all(
          rawCollabs.map(async c => {
            const existing = this.collaborators.find(e => e.uid === c.uid);
            return {
              ...c,
              username: existing?.username ?? (await this.noteService.getUsernameByUid(c.uid)) ?? c.uid,
              removing: existing?.removing ?? false,
            };
          })
        );
        this.loading.set(false);
      });
    }
  }

  ngOnDestroy() {
    this.collabUnsub?.();
  }

  private async loadOwnerUsername() {
    if (!this.data.ownerUid) return;
    this.ownerUsername = await this.noteService.getUsernameByUid(this.data.ownerUid);
  }

  private async loadActiveInvite() {
    const token = await this.noteService.getActiveInvite(this.data.noteId);
    if (token) {
      this.inviteToken = token;
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
      // Se esiste già un invite attivo, cancellalo prima (rigenera)
      if (this.inviteToken) {
        await this.noteService.deleteInvite(this.inviteToken);
        this.inviteToken = null;
        this.inviteUrl = null;
      }
      const token = await this.noteService.createInvite(this.data.noteId);
      this.inviteToken = token;
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

  async leaveNote() {
    this.leaving.set(true);
    try {
      await this.noteService.leaveSharedNote(this.data.noteId);
      this.dialogRef.close({ left: true });
    } finally {
      this.leaving.set(false);
    }
  }
}
