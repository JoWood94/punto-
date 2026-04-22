/**
 * vitest.setup.ts — Mocks globali per i test unitari
 *
 * Registrato come setupFiles in angular.json → eseguito da Vitest PRIMA di ogni spec file.
 * Le chiamate vi.mock() qui sono genuinamente top-level: nessun warning di nesting.
 *
 * Motivazione: @angular/build:unit-test avvolge i file spec in una factory
 * che causa il warning "not at the top level" per vi.mock/vi.hoisted definiti
 * nei file spec. Spostando i mock qui il problema è risolto alla radice.
 */

// ─── openpgp ──────────────────────────────────────────────────────────────────
// CryptoService importa openpgp a livello di modulo; il suo codice di init
// fallisce nell'ambiente Node.js di test con "concatUint8Array: Data must be Uint8Array".
vi.mock('openpgp', () => ({
  readKey: vi.fn(async () => ({})),
  encrypt: vi.fn(async () => ({ data: 'MOCK_ENCRYPTED' })),
  decrypt: vi.fn(async () => ({ data: 'MOCK_DECRYPTED' })),
  readPrivateKey: vi.fn(async () => ({})),
  decryptKey: vi.fn(async (opts: any) => opts.privateKey ?? {}),
  generateKey: vi.fn(async () => ({ publicKey: 'MOCK_PUB', privateKey: 'MOCK_PRIV' })),
  encryptKey: vi.fn(async () => ({ armor: () => 'MOCK_ARMOR' })),
  createMessage: vi.fn(async () => ({})),
  Message: class {},
}));

// ─── firebase/app ─────────────────────────────────────────────────────────────
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

// ─── firebase/auth ────────────────────────────────────────────────────────────
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({})),
}));

// ─── firebase/firestore ───────────────────────────────────────────────────────
// Le implementazioni di default sono placeholder. I test che le usano impostano
// mockImplementation/mockResolvedValue nel proprio beforeEach.
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({})),
  initializeFirestore: vi.fn(() => ({})),
  persistentLocalCache: vi.fn(() => ({})),
  persistentMultipleTabManager: vi.fn(() => ({})),
  collection: vi.fn(() => 'mock-collection-ref'),
  doc: vi.fn(() => 'mock-doc-ref'),
  addDoc: vi.fn(async () => ({ id: 'created-note-id' })),
  updateDoc: vi.fn(async () => {}),
  getDoc: vi.fn(async () => ({ exists: () => false, data: () => null })),
  getDocFromServer: vi.fn(async () => ({ exists: () => false, data: () => null })),
  deleteDoc: vi.fn(async () => {}),
  query: vi.fn(() => 'mock-query'),
  where: vi.fn(() => 'mock-where'),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: vi.fn(async () => {}),
  writeBatch: vi.fn(() => ({
    set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}),
  })),
  arrayUnion: vi.fn((...args: any[]) => args),
  arrayRemove: vi.fn((...args: any[]) => args),
  getDocs: vi.fn(async () => ({ docs: [] })),
  deleteField: vi.fn(() => '__DELETE__'),
  DocumentReference: class {},
  DocumentSnapshot: class {},
}));
