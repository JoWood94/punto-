/**
 * note.spec.ts — Fase 0 unit tests
 *
 * Verifica:
 *  1. Type guard helpers (isNoteType / isMemoType / isEventType)
 *  2. createNote: defaults, strip ReminderBlock, validazione schema, hasReminderBlock
 *  3. updateNote: immutabilità type, ricalcolo hasReminderBlock
 *
 * I vi.mock() globali (Firebase, openpgp) sono in src/vitest.setup.ts
 * (setupFiles in angular.json) — qui non servono vi.mock né vi.hoisted.
 */

import { TestBed } from '@angular/core/testing';
import { addDoc, updateDoc, getDocFromServer } from 'firebase/firestore';
import {
  NoteService,
  NoteBlock,
  ReminderBlock,
  TextBlock,
  isNoteType,
  isMemoType,
  isEventType,
} from './note';
import { AuthService } from './auth';
import { CryptoService } from './crypto';

// ─── Helpers test ─────────────────────────────────────────────────────────────

const MOCK_UID = 'test-uid-abc';

/** Crea un mock di DocumentSnapshot Firestore */
const makeSnap = (data: any, exists = true) => ({
  exists: () => exists,
  data: () => data,
  id: 'mock-doc-id',
  ref: 'mock-doc-ref',
});

function buildReminderBlock(): ReminderBlock {
  return {
    type: 'reminder',
    time: Date.now() + 3600_000,
    recurrence: 'none',
    status: 'pending',
  };
}

function buildTextBlock(html = '<p>Testo</p>'): TextBlock {
  return { type: 'text', html };
}

/** Payload passato all'ultimo addDoc (secondo argomento) */
function lastCreatePayload(): any {
  const calls = vi.mocked(addDoc).mock.calls as any[][];
  return calls.length > 0 ? calls[calls.length - 1][1] : null;
}

/** Payload passato all'ultimo updateDoc (secondo argomento) */
function lastUpdatePayload(): any {
  const calls = vi.mocked(updateDoc).mock.calls as any[][];
  return calls.length > 0 ? calls[calls.length - 1][1] : null;
}

// ─── Setup TestBed ────────────────────────────────────────────────────────────

describe('NoteService — Fase 0', () => {
  let service: NoteService;

  const mockAuthService = {
    getCurrentUserId: vi.fn(() => MOCK_UID),
    user$: { pipe: vi.fn() },
    reloadUser: vi.fn(async () => {}),
  };

  const mockCryptoService = {
    isEnabled: false,
    encryptNote: vi.fn(async (data: any) => data),
    decryptNote: vi.fn(async (data: any) => data),
    getLocalPrivateKey: vi.fn(() => null),
    getLocalSessionVersion: vi.fn(() => null),
    clearLocalKey: vi.fn(),
    clearLocalSessionVersion: vi.fn(),
    clearSession: vi.fn(),
    setSession: vi.fn(),
    saveLocalSessionVersion: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: nessun documento trovato (owner ownership check = not found → skip guard)
    vi.mocked(getDocFromServer).mockResolvedValue(makeSnap(null, false) as any);

    TestBed.configureTestingModule({
      providers: [
        NoteService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: CryptoService, useValue: mockCryptoService },
      ],
    });
    service = TestBed.inject(NoteService);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Type guard helpers (funzioni pure — nessun Firebase)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Type guard helpers', () => {
    it('isNoteType: true per type="note"', () => {
      expect(isNoteType({ type: 'note' })).toBe(true);
    });

    it('isNoteType: true per doc legacy senza campo type (graceful default)', () => {
      expect(isNoteType({})).toBe(true);
    });

    it('isNoteType: false per type="memo"', () => {
      expect(isNoteType({ type: 'memo' })).toBe(false);
    });

    it('isNoteType: false per type="event"', () => {
      expect(isNoteType({ type: 'event' })).toBe(false);
    });

    it('isMemoType: true per type="memo"', () => {
      expect(isMemoType({ type: 'memo' })).toBe(true);
    });

    it('isMemoType: false per doc senza type (legacy = note)', () => {
      expect(isMemoType({})).toBe(false);
    });

    it('isEventType: true per type="event"', () => {
      expect(isEventType({ type: 'event' })).toBe(true);
    });

    it('isEventType: false per type="note"', () => {
      expect(isEventType({ type: 'note' })).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. createNote
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createNote', () => {
    it('type default="note" quando omesso — hasReminderBlock=false', async () => {
      await service.createNote({
        title: 'Nota semplice',
        color: 'default',
        blocks: [buildTextBlock()],
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('note');
      expect(payload.hasReminderBlock).toBe(false);
    });

    it('type="note" senza reminder — hasReminderBlock=false', async () => {
      await service.createNote({
        type: 'note',
        title: 'Nota',
        color: 'default',
        blocks: [buildTextBlock()],
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('note');
      expect(payload.hasReminderBlock).toBe(false);
    });

    it('type="note" con ReminderBlock → strip silenzioso, hasReminderBlock=false', async () => {
      const blocks: NoteBlock[] = [buildTextBlock(), buildReminderBlock()];
      await service.createNote({
        type: 'note',
        title: 'Nota con reminder non consentito',
        color: 'default',
        blocks,
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('note');
      const hasRem = (payload.blocks as NoteBlock[]).some(b => b.type === 'reminder');
      expect(hasRem).toBe(false);
      expect(payload.hasReminderBlock).toBe(false);
    });

    it('type="note" con solo TextBlock — blocks invariati', async () => {
      const textBlock = buildTextBlock('<p>Contenuto</p>');
      await service.createNote({
        type: 'note',
        title: 'Nota',
        color: 'default',
        blocks: [textBlock],
      });
      const payload = lastCreatePayload();
      expect(payload.blocks).toHaveLength(1);
      expect(payload.blocks[0].type).toBe('text');
    });

    it('type="memo" senza ReminderBlock — hasReminderBlock=false (UI valida in Fase 1)', async () => {
      await service.createNote({
        type: 'memo',
        title: 'Promemoria senza orario',
        color: 'default',
        blocks: [buildTextBlock()],
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('memo');
      expect(payload.hasReminderBlock).toBe(false);
    });

    it('type="memo" con ReminderBlock — non strippato, hasReminderBlock=true', async () => {
      await service.createNote({
        type: 'memo',
        title: 'Promemoria',
        color: 'default',
        blocks: [buildTextBlock(), buildReminderBlock()],
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('memo');
      expect(payload.hasReminderBlock).toBe(true);
      const hasRem = (payload.blocks as NoteBlock[]).some(b => b.type === 'reminder');
      expect(hasRem).toBe(true);
    });

    it('type="event" senza calendarId → throw', async () => {
      await expect(
        service.createNote({
          type: 'event',
          title: 'Evento senza calendario',
          color: 'default',
          blocks: [],
        })
      ).rejects.toThrow('calendarId è obbligatorio per type="event"');
    });

    it('type="event" con calendarId → OK, tipo e calendarId nel payload', async () => {
      await service.createNote({
        type: 'event',
        title: 'Concerto',
        color: 'default',
        calendarId: 'cal-abc-123',
        blocks: [buildTextBlock(), buildReminderBlock()],
      });
      const payload = lastCreatePayload();
      expect(payload.type).toBe('event');
      expect(payload.calendarId).toBe('cal-abc-123');
      expect(payload.hasReminderBlock).toBe(true);
    });

    it('uid viene sempre impostato dall\'utente autenticato', async () => {
      await service.createNote({ type: 'note', title: 'X', color: 'default', blocks: [] });
      expect(lastCreatePayload().uid).toBe(MOCK_UID);
    });

    it('createdAt viene impostato automaticamente', async () => {
      const before = Date.now();
      await service.createNote({ type: 'note', title: 'X', color: 'default', blocks: [] });
      const after = Date.now();
      const payload = lastCreatePayload();
      expect(payload.createdAt).toBeGreaterThanOrEqual(before);
      expect(payload.createdAt).toBeLessThanOrEqual(after);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. updateNote
  // ═══════════════════════════════════════════════════════════════════════════

  describe('updateNote', () => {
    beforeEach(() => {
      // Simula documento esistente come owner note
      vi.mocked(getDocFromServer).mockResolvedValue(
        makeSnap({ type: 'note', uid: MOCK_UID, collaboratorUids: [] }, true) as any
      );
    });

    it('cambio type → throw (type immutabile)', async () => {
      await expect(
        service.updateNote('note-id', { type: 'memo', title: 'Cambio tipo vietato' })
      ).rejects.toThrow('type è immutabile');
    });

    it('update con stesso type → OK (no conflitto)', async () => {
      await expect(
        service.updateNote('note-id', { type: 'note', title: 'Titolo aggiornato' })
      ).resolves.not.toThrow();
    });

    it('update senza campo type → OK (guard non attivato)', async () => {
      await expect(
        service.updateNote('note-id', { title: 'Solo titolo' })
      ).resolves.not.toThrow();
    });

    it('update con blocks → hasReminderBlock=true quando reminder presente', async () => {
      await service.updateNote('note-id', {
        blocks: [buildTextBlock(), buildReminderBlock()],
      });
      const payload = lastUpdatePayload();
      expect(payload.hasReminderBlock).toBe(true);
    });

    it('update con blocks → hasReminderBlock=false quando reminder rimosso', async () => {
      await service.updateNote('note-id', {
        blocks: [buildTextBlock()],
      });
      const payload = lastUpdatePayload();
      expect(payload.hasReminderBlock).toBe(false);
    });

    it('update senza blocks → hasReminderBlock NON incluso nel payload', async () => {
      await service.updateNote('note-id', { title: 'Solo titolo' });
      const payload = lastUpdatePayload();
      expect(payload.hasReminderBlock).toBeUndefined();
    });

    it('updatedAt aggiunto automaticamente al payload', async () => {
      const before = Date.now();
      await service.updateNote('note-id', { title: 'Test' });
      const after = Date.now();
      const payload = lastUpdatePayload();
      expect(payload.updatedAt).toBeGreaterThanOrEqual(before);
      expect(payload.updatedAt).toBeLessThanOrEqual(after);
    });
  });
});
