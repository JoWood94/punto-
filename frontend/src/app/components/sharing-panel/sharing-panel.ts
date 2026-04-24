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
import { ToastService } from '../../services/toast';

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
  private toastService = inject(ToastService);
  private dialogRef = inject(MatDialogRef<SharingPanelComponent>);
  data: { noteId: string; myRole?: 'owner' | 'guest'; ownerUid?: string } = inject(MAT_DIALOG_DATA);

  loading = signal(true);
  generatingCode = signal(false);
  copyDone = signal(false);
  leaving = signal(false);
  shareCode = signal<string | null>(null);
  collaborators = signal<CollaboratorUI[]>([]);
  revoking = signal(false);
  ownerUsername: string | null = null;
  private collabUnsub: (() => void) | null = null;

  get isGuest(): boolean {
    return this.data.myRole === 'guest';
  }

  get currentUserId(): string | null {
    return this.authService.getCurrentUserId();
  }

  async ngOnInit() {
    if (this.isGuest) {
      await Promise.all([
        this.loadCollaborators(),
        this.loadOwnerUsername(),
      ]);
      this.loading.set(false);
    } else {
      this.noteService.cleanupExpiredInvites(this.data.noteId).catch(() => {});
      // Live watcher: aggiorna la lista collaboratori in tempo reale
      this.collabUnsub = this.noteService.watchCollaborators(this.data.noteId, async (rawCollabs) => {
        const updated = await Promise.all(
          rawCollabs.map(async c => {
            const existing = this.collaborators().find(e => e.uid === c.uid);
            return {
              ...c,
              username: existing?.username ?? (await this.noteService.getUsernameByUid(c.uid)) ?? c.uid,
              removing: existing?.removing ?? false,
            };
          })
        );
        this.collaborators.set(updated);
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

  private async loadCollaborators() {
    const list = await this.noteService.getCollaborators(this.data.noteId);
    this.collaborators.set(await Promise.all(
      list.map(async c => ({
        ...c,
        username: (await this.noteService.getUsernameByUid(c.uid)) ?? c.uid,
        removing: false,
      }))
    ));
  }

  async generateCode() {
    this.generatingCode.set(true);
    try {
      const code = await this.noteService.generateShareCode(this.data.noteId);
      this.shareCode.set(code);
    } catch (err: any) {
      const msg = err?.message === 'share/note-too-large'
        ? this.translationService.instant('SHARING.NOTE_TOO_LARGE')
        : this.translationService.instant('SHARING.GENERATE_ERROR');
      this.toastService.show(msg, 5000);
    } finally {
      this.generatingCode.set(false);
    }
  }

  async copyCode() {
    const code = this.shareCode();
    if (!code) return;
    await navigator.clipboard.writeText(code);
    this.copyDone.set(true);
    setTimeout(() => this.copyDone.set(false), 2000);
  }

  async revokeCode() {
    this.generatingCode.set(true);
    try {
      await this.noteService.revokeShareCode(this.data.noteId);
      this.shareCode.set(null);
    } finally {
      this.generatingCode.set(false);
    }
  }

  async togglePermission(collab: CollaboratorUI, perm: keyof CollaboratorPermissions) {
    collab.permissions = { ...collab.permissions, [perm]: !collab.permissions[perm] };
    await this.noteService.updateCollaboratorPermissions(this.data.noteId, collab.uid, collab.permissions);
  }

  async removeCollaborator(collab: CollaboratorUI) {
    collab.removing = true;
    try {
      await this.noteService.removeCollaborator(this.data.noteId, collab.uid);
      this.collaborators.set(this.collaborators().filter(c => c.uid !== collab.uid));
    } catch {
      collab.removing = false;
    }
  }

  async revokeAll() {
    this.revoking.set(true);
    try {
      await this.noteService.revokeAllCollaborators(this.data.noteId);
      this.collaborators.set([]);
      this.shareCode.set(null);
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
