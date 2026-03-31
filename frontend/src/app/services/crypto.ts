import { Injectable } from '@angular/core';
import * as openpgp from 'openpgp';
import { Note } from './note';

const ENCRYPTED_FIELDS: (keyof Note)[] = ['title', 'content'];
const ENCRYPTED_JSON_FIELDS: (keyof Note)[] = ['blocks'];
const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private _uid: string | null = null;
  private _publicKey: string | null = null;
  private _encryptionEnabled = false;

  // ─── Session ───────────────────────────────────────────────────────────────

  setSession(uid: string, publicKey: string) {
    this._uid = uid;
    this._publicKey = publicKey;
    this._encryptionEnabled = true;
  }

  clearSession() {
    this._uid = null;
    this._publicKey = null;
    this._encryptionEnabled = false;
  }

  get isEnabled(): boolean {
    return this._encryptionEnabled;
  }

  get currentUid(): string | null {
    return this._uid;
  }

  // ─── Key Generation ────────────────────────────────────────────────────────

  async generateAndStoreKeys(uid: string, passphrase: string): Promise<{ publicKey: string; encryptedPrivateKey: string }> {
    const { privateKey: privArmored, publicKey } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'ed25519' as any,
      userIDs: [{ email: uid }],
      passphrase: ''
    });

    // Encrypt private key with user passphrase
    const privateKeyObj = await openpgp.readPrivateKey({ armoredKey: privArmored });
    const encryptedKeyObj = await openpgp.encryptKey({
      privateKey: privateKeyObj,
      passphrase
    });
    const encryptedPrivateKey = encryptedKeyObj.armor();

    // Store plain private key in localStorage
    localStorage.setItem(`pgp_private_${uid}`, privArmored);

    return { publicKey, encryptedPrivateKey };
  }

  // ─── Local Key ─────────────────────────────────────────────────────────────

  getLocalPrivateKey(uid: string): string | null {
    return localStorage.getItem(`pgp_private_${uid}`);
  }

  async unlockPrivateKey(uid: string, encryptedPrivateKey: string, passphrase: string): Promise<void> {
    const encryptedKeyObj = await openpgp.readPrivateKey({ armoredKey: encryptedPrivateKey });
    const decryptedKeyObj = await openpgp.decryptKey({
      privateKey: encryptedKeyObj,
      passphrase
    });
    localStorage.setItem(`pgp_private_${uid}`, decryptedKeyObj.armor());
  }

  clearLocalKey(uid: string): void {
    localStorage.removeItem(`pgp_private_${uid}`);
  }

  // ─── Note Encryption ───────────────────────────────────────────────────────

  async encryptNote(note: Partial<Note>): Promise<Partial<Note>> {
    if (!this._publicKey) return note;
    const publicKey = await openpgp.readKey({ armoredKey: this._publicKey });
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (value.startsWith(PGP_MARKER)) continue; // already encrypted
      (result as any)[field] = await this._encryptString(value, publicKey);
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value) continue;
      const text = JSON.stringify(value);
      if (!text || text === '[]' || text === '{}') continue;
      (result as any)[field] = await this._encryptString(text, publicKey);
    }

    return result;
  }

  async decryptNote(note: Partial<Note>): Promise<Partial<Note>> {
    if (!this._uid) return note;
    const privArmored = this.getLocalPrivateKey(this._uid);
    if (!privArmored) return note; // backward compat: no key → return as-is

    const privateKey = await openpgp.readPrivateKey({ armoredKey: privArmored });
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!value.startsWith(PGP_MARKER)) continue; // not encrypted
      try {
        (result as any)[field] = await this._decryptString(value, privateKey);
      } catch (e) {
        console.error(`[CryptoService] Failed to decrypt field ${String(field)}:`, e);
      }
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!value.startsWith(PGP_MARKER)) continue;
      try {
        const decrypted = await this._decryptString(value, privateKey);
        (result as any)[field] = JSON.parse(decrypted);
      } catch (e) {
        console.error(`[CryptoService] Failed to decrypt JSON field ${String(field)}:`, e);
      }
    }

    return result;
  }

  // ─── Primitives ────────────────────────────────────────────────────────────

  private async _encryptString(text: string, publicKey: openpgp.PublicKey): Promise<string> {
    const message = await openpgp.createMessage({ text });
    return await openpgp.encrypt({ message, encryptionKeys: publicKey }) as string;
  }

  private async _decryptString(armored: string, privateKey: openpgp.PrivateKey): Promise<string> {
    const message = await openpgp.readMessage({ armoredMessage: armored });
    const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
    return data as string;
  }
}
