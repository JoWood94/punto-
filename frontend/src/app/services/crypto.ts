import { Injectable } from '@angular/core';
import * as openpgp from 'openpgp';
import { Note } from './note';

const ENCRYPTED_FIELDS: (keyof Note)[] = ['title', 'content'];
const ENCRYPTED_JSON_FIELDS: (keyof Note)[] = ['blocks'];
const PGP_MARKER = '-----BEGIN PGP MESSAGE-----';
export const AES_MARKER = 'AES1:';

// ─── Base64url helpers (no external dependency) ────────────────────────────────

function bufToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToBuf(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(pad);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

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
      userIDs: [{ name: uid }],
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

  /** Ricifra la chiave privata con una nuova passphrase. Restituisce il nuovo encryptedPrivateKey armored. */
  async changePassphrase(uid: string, oldPassphrase: string, newPassphrase: string, encryptedPrivateKey: string): Promise<string> {
    const encryptedKeyObj = await openpgp.readPrivateKey({ armoredKey: encryptedPrivateKey });
    const decryptedKeyObj = await openpgp.decryptKey({
      privateKey: encryptedKeyObj,
      passphrase: oldPassphrase
    });
    localStorage.setItem(`pgp_private_${uid}`, decryptedKeyObj.armor());
    const newEncryptedKeyObj = await openpgp.encryptKey({
      privateKey: decryptedKeyObj,
      passphrase: newPassphrase
    });
    return newEncryptedKeyObj.armor();
  }

  /** Salva la versione di sessione localmente (per rilevare forced logout). */
  saveLocalSessionVersion(uid: string, version: number): void {
    localStorage.setItem(`session_version_${uid}`, String(version));
  }

  getLocalSessionVersion(uid: string): number | null {
    const v = localStorage.getItem(`session_version_${uid}`);
    return v !== null ? Number(v) : null;
  }

  clearLocalSessionVersion(uid: string): void {
    localStorage.removeItem(`session_version_${uid}`);
  }

  // ─── AES-GCM 256 Note Key ──────────────────────────────────────────────────

  /** Genera una nuova chiave AES-GCM 256 bit extractable. */
  async generateNoteKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /** Esporta una CryptoKey AES in formato base64url raw. */
  async exportNoteKey(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', key);
    return bufToBase64url(raw);
  }

  /** Importa una CryptoKey AES da base64url raw. */
  async importNoteKey(base64url: string): Promise<CryptoKey> {
    const raw = base64urlToBuf(base64url);
    return crypto.subtle.importKey(
      'raw',
      raw.buffer as ArrayBuffer,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Cifra plaintext con AES-GCM 256. IV random 12 byte.
   * Output: `AES1:<base64url(iv)>.<base64url(ciphertext)>`
   */
  async encryptNoteAES(key: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );
    return `${AES_MARKER}${bufToBase64url(iv.buffer as ArrayBuffer)}.${bufToBase64url(cipherBuf)}`;
  }

  /**
   * Decripta un blob AES-GCM. Accetta sia il formato con prefisso `AES1:` sia
   * il formato grezzo `<iv>.<ciphertext>` per flessibilita interna.
   */
  async decryptNoteAES(key: CryptoKey, ciphertext: string): Promise<string> {
    const blob = ciphertext.startsWith(AES_MARKER)
      ? ciphertext.slice(AES_MARKER.length)
      : ciphertext;
    const dotIdx = blob.indexOf('.');
    if (dotIdx === -1) throw new Error('decryptNoteAES: formato non valido');
    const ivBytes = base64urlToBuf(blob.slice(0, dotIdx));
    const dataBytes = base64urlToBuf(blob.slice(dotIdx + 1));
    const plainBuf = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes.buffer as ArrayBuffer },
      key,
      dataBytes.buffer as ArrayBuffer
    );
    return new TextDecoder().decode(plainBuf);
  }

  /**
   * Wrappa una CryptoKey AES con la public PGP key del destinatario.
   * Restituisce una stringa PGP armored contenente il raw della chiave AES cifrato.
   */
  async wrapKeyForUser(aesKey: CryptoKey, pgpPublicKeyArmored: string): Promise<string> {
    const raw = await crypto.subtle.exportKey('raw', aesKey);
    const keyBase64url = bufToBase64url(raw);
    const publicKey = await openpgp.readKey({ armoredKey: pgpPublicKeyArmored });
    const message = await openpgp.createMessage({ text: keyBase64url });
    return await openpgp.encrypt({ message, encryptionKeys: publicKey }) as string;
  }

  /**
   * Unwrappa una chiave AES cifrata con PGP usando la propria chiave privata.
   * Ritorna la CryptoKey AES pronta all'uso.
   */
  async unwrapKeyForSelf(uid: string, wrappedKey: string): Promise<CryptoKey> {
    const privArmored = this.getLocalPrivateKey(uid);
    if (!privArmored) throw new Error('unwrapKeyForSelf: chiave privata non disponibile');
    const privateKey = await openpgp.readPrivateKey({ armoredKey: privArmored });
    const message = await openpgp.readMessage({ armoredMessage: wrappedKey });
    const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
    return this.importNoteKey(data as string);
  }

  // ─── Marker detection ──────────────────────────────────────────────────────

  /** True se il valore e cifrato con PGP. */
  isPGPEncrypted(value: string): boolean {
    return value.startsWith(PGP_MARKER);
  }

  /** True se il valore e cifrato con AES-GCM (nuovo schema). */
  isAESEncrypted(value: string): boolean {
    return value.startsWith(AES_MARKER);
  }

  /** True se il valore e cifrato con qualsiasi schema supportato. */
  isEncryptedValue(value: string): boolean {
    return this.isPGPEncrypted(value) || this.isAESEncrypted(value);
  }

  // ─── Note Encryption (PGP) ─────────────────────────────────────────────────

  async encryptNote(note: Partial<Note>, skipFields: (keyof Note)[] = []): Promise<Partial<Note>> {
    if (!this._publicKey) return note;
    const publicKey = await openpgp.readKey({ armoredKey: this._publicKey });
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      if (skipFields.includes(field)) continue;
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (this.isEncryptedValue(value)) continue; // already encrypted
      (result as any)[field] = await this._encryptString(value, publicKey);
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (!text || text === '[]' || text === '{}') continue;
      if (this.isEncryptedValue(text)) continue;
      (result as any)[field] = await this._encryptString(text, publicKey);
    }

    return result;
  }

  async decryptNote(note: Partial<Note>): Promise<Partial<Note>> {
    if (!this._uid) return note;
    const privArmored = this.getLocalPrivateKey(this._uid);
    if (!privArmored) return note;

    const privateKey = await openpgp.readPrivateKey({ armoredKey: privArmored });
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!this.isPGPEncrypted(value)) continue; // not PGP encrypted
      try {
        (result as any)[field] = await this._decryptString(value, privateKey);
      } catch (e) {
        // Silenzioso in produzione — campo rimane cifrato
      }
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!this.isPGPEncrypted(value)) continue;
      try {
        const decrypted = await this._decryptString(value, privateKey);
        (result as any)[field] = JSON.parse(decrypted);
      } catch (e) {
        // Silenzioso in produzione
      }
    }

    return result;
  }

  /**
   * Decripta una nota cifrata con AES-GCM dato una CryptoKey gia importata.
   * Usato dal NoteService per le note condivise.
   */
  async decryptNoteWithAESKey(note: Partial<Note>, aesKey: CryptoKey): Promise<Partial<Note>> {
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!this.isAESEncrypted(value)) continue;
      try {
        (result as any)[field] = await this.decryptNoteAES(aesKey, value);
      } catch {
        // Silenzioso — campo rimane cifrato
      }
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (!this.isAESEncrypted(value)) continue;
      try {
        const decrypted = await this.decryptNoteAES(aesKey, value);
        (result as any)[field] = JSON.parse(decrypted);
      } catch {
        // Silenzioso
      }
    }

    return result;
  }

  /**
   * Cifra una nota con AES-GCM data una CryptoKey gia importata.
   * Usato dal NoteService per le note condivise.
   */
  async encryptNoteWithAESKey(
    note: Partial<Note>,
    aesKey: CryptoKey,
    skipFields: (keyof Note)[] = []
  ): Promise<Partial<Note>> {
    const result = { ...note };

    for (const field of ENCRYPTED_FIELDS) {
      if (skipFields.includes(field)) continue;
      const value = (result as any)[field];
      if (!value || typeof value !== 'string') continue;
      if (this.isEncryptedValue(value)) continue;
      (result as any)[field] = await this.encryptNoteAES(aesKey, value);
    }

    for (const field of ENCRYPTED_JSON_FIELDS) {
      const value = (result as any)[field];
      if (!value) continue;
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      if (!text || text === '[]' || text === '{}') continue;
      if (this.isEncryptedValue(text)) continue;
      (result as any)[field] = await this.encryptNoteAES(aesKey, text);
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
