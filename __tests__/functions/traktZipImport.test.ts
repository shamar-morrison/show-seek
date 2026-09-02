let store: Map<string, Record<string, unknown>>;
let storageFiles: Map<string, { exists: boolean; content: Buffer }>;
let fileDeleteCalls: string[];
let mockFileDownloadOverride: (() => Promise<[Buffer]>) | null = null;
let mockFileMetadataOverride: (() => Promise<[{ size: number }]>) | null = null;

const mockDefineSecret = jest.fn(() => ({
  value: () => 'test-secret',
}));
const mockEnqueue = jest.fn();
const mockOnCall = jest.fn((_options, handler) => handler);
const mockOnTaskDispatched = jest.fn((_options, handler) => handler);
const firestoreFn: jest.Mock = jest.fn();

jest.mock(
  'firebase-functions/params',
  () => ({
    defineSecret: mockDefineSecret,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-functions/v2/https',
  () => ({
    HttpsError: class HttpsError extends Error {
      constructor(
        readonly code: string,
        message: string,
        readonly details?: unknown
      ) {
        super(message);
        this.name = 'HttpsError';
      }
    },
    onCall: mockOnCall,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-functions/v2/tasks',
  () => ({
    onTaskDispatched: mockOnTaskDispatched,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/functions',
  () => ({
    getFunctions: jest.fn(() => ({
      taskQueue: jest.fn(() => ({
        enqueue: mockEnqueue,
      })),
    })),
  }),
  { virtual: true }
);

class MockTimestamp {
  constructor(readonly millis: number) {}

  static fromDate(date: Date): MockTimestamp {
    return new MockTimestamp(date.getTime());
  }

  static fromMillis(millis: number): MockTimestamp {
    return new MockTimestamp(millis);
  }

  static now(): MockTimestamp {
    return new MockTimestamp(Date.now());
  }

  toDate(): Date {
    return new Date(this.millis);
  }

  toMillis(): number {
    return this.millis;
  }
}

function cloneValue(val: unknown): unknown {
  if (val instanceof MockTimestamp) {
    return MockTimestamp.fromMillis(val.toMillis());
  }
  if (Array.isArray(val)) {
    return val.map(cloneValue);
  }
  if (val && typeof val === 'object') {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      copy[k] = cloneValue(v);
    }
    return copy;
  }
  return val;
}

class MockDocSnapshot {
  constructor(
    readonly ref: MockDocRef,
    private readonly value: Record<string, unknown> | undefined
  ) {}

  get exists() {
    return this.value !== undefined;
  }

  get id() {
    return this.ref.id;
  }

  data() {
    return this.value ? (cloneValue(this.value) as Record<string, unknown>) : undefined;
  }
}

class MockDocRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Map<string, Record<string, unknown>>
  ) {}

  get id() {
    return this.path.split('/').pop() ?? '';
  }

  collection(name: string) {
    return new MockCollectionRef(`${this.path}/${name}`, this.backingStore);
  }

  async get() {
    return new MockDocSnapshot(this, this.backingStore.get(this.path));
  }

  async set(value: Record<string, unknown>, options?: { merge?: boolean }) {
    const existing = this.backingStore.get(this.path);
    if (options?.merge && existing) {
      const merged = { ...existing };
      Object.entries(value).forEach(([k, v]) => {
        if (
          v === '__deleteField__' ||
          v === 'FIELD_DELETE' ||
          (typeof v === 'object' && v !== null && (v as { _methodName?: string })._methodName === 'FieldValue.delete')
        ) {
          delete merged[k];
        } else if (
          typeof v === 'object' &&
          v !== null &&
          !Array.isArray(v) &&
          !(v instanceof MockTimestamp) &&
          typeof existing[k] === 'object' &&
          existing[k] !== null
        ) {
          const nested = { ...(existing[k] as Record<string, unknown>) };
          Object.entries(v as Record<string, unknown>).forEach(([nk, nv]) => {
            if (
              nv === '__deleteField__' ||
              nv === 'FIELD_DELETE' ||
              (typeof nv === 'object' && nv !== null && (nv as { _methodName?: string })._methodName === 'FieldValue.delete')
            ) {
              delete nested[nk];
            } else {
              nested[nk] = cloneValue(nv);
            }
          });
          merged[k] = nested;
        } else {
          merged[k] = cloneValue(v);
        }
      });
      this.backingStore.set(this.path, merged);
    } else {
      this.backingStore.set(this.path, cloneValue(value) as Record<string, unknown>);
    }
  }
}

class MockCollectionRef {
  constructor(
    readonly path: string,
    private readonly backingStore: Map<string, Record<string, unknown>>
  ) {}

  doc(id?: string) {
    const docId = id ?? Math.random().toString(36).substring(2, 12);
    return new MockDocRef(`${this.path}/${docId}`, this.backingStore);
  }

  async get() {
    const docs = [...this.backingStore.entries()]
      .filter(([path]) => isDirectChildDocPath(this.path, path))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, value]) => new MockDocSnapshot(new MockDocRef(path, this.backingStore), value));

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }
}

class MockWriteBatch {
  private readonly operations: Array<() => Promise<void>> = [];

  set(docRef: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) {
    this.operations.push(async () => {
      await docRef.set(data, options);
    });
    return this;
  }

  delete(docRef: MockDocRef) {
    this.operations.push(async () => {
      store.delete(docRef.path);
    });
    return this;
  }

  async commit() {
    for (const op of this.operations) {
      await op();
    }
  }
}

function isDirectChildDocPath(collectionPath: string, docPath: string): boolean {
  if (!docPath.startsWith(`${collectionPath}/`)) {
    return false;
  }
  const relative = docPath.slice(collectionPath.length + 1);
  return !relative.includes('/');
}

class MockTransaction {
  constructor(private readonly backingStore: Map<string, Record<string, unknown>>) {}

  async get(docRef: MockDocRef) {
    return docRef.get();
  }

  set(docRef: MockDocRef, data: Record<string, unknown>, options?: { merge?: boolean }) {
    docRef.set(data, options);
    return this;
  }
}

const mockFirestore = {
  batch: () => new MockWriteBatch(),
  collection: (name: string) => new MockCollectionRef(name, store),
  doc: (path: string) => new MockDocRef(path, store),
  runTransaction: jest.fn(async (cb: (t: MockTransaction) => Promise<unknown>) => cb(new MockTransaction(store))),
};

firestoreFn.mockImplementation(() => mockFirestore);

const mockBucket = {
  file: (filePath: string) => ({
    delete: jest.fn(async () => {
      fileDeleteCalls.push(filePath);
      storageFiles.delete(filePath);
    }),
    download: jest.fn(async () => {
      if (mockFileDownloadOverride) {
        return mockFileDownloadOverride();
      }
      const fileData = storageFiles.get(filePath);
      if (!fileData || !fileData.exists) {
        throw new Error('File not found in storage');
      }
      return [fileData.content];
    }),
    exists: jest.fn(async () => {
      const fileData = storageFiles.get(filePath);
      return [Boolean(fileData?.exists)];
    }),
    getMetadata: jest.fn(async () => {
      if (mockFileMetadataOverride) {
        return mockFileMetadataOverride();
      }
      const fileData = storageFiles.get(filePath);
      return [{ size: fileData?.content.length ?? 0 }];
    }),
    name: filePath,
  }),
};

const mockStorage = jest.fn(() => ({
  bucket: () => mockBucket,
}));

jest.mock(
  'firebase-admin',
  () => ({
    auth: jest.fn(() => ({
      verifyIdToken: jest.fn(),
    })),
    firestore: firestoreFn,
    initializeApp: jest.fn(),
    storage: mockStorage,
  }),
  { virtual: true }
);

jest.mock(
  'firebase-admin/firestore',
  () => ({
    FieldValue: {
      delete: jest.fn(() => 'FIELD_DELETE'),
    },
    Timestamp: MockTimestamp,
  }),
  { virtual: true }
);

import AdmZip = require('adm-zip');
import {
  runTraktZipImportHandler,
  startTraktZipImportHandler,
} from '../../functions/src/trakt/zipImport';
import {
  parseTraktZipBuffer,
  TraktZipCorruptArchiveError,
  TraktZipSizeLimitError,
} from '../../functions/src/trakt/zipParser';

const SafeAdmZip = (AdmZip as unknown as { default?: typeof AdmZip }).default || AdmZip;

describe('Trakt Zip Import Cloud Functions (Stage 3)', () => {
  const userId = 'user-premium-123';
  const importId = 'zip_123456789_abcdef';
  const storagePath = `users/${userId}/imports/${importId}.zip`;
  const progressDocPath = `users/${userId}/trakt_imports/${importId}`;

  beforeEach(() => {
    store = new Map<string, Record<string, unknown>>();
    storageFiles = new Map<string, { exists: boolean; content: Buffer }>();
    fileDeleteCalls = [];
    mockFileDownloadOverride = null;
    mockFileMetadataOverride = null;
    jest.clearAllMocks();
    firestoreFn.mockImplementation(() => mockFirestore);
  });

  describe('startTraktZipImport', () => {
    it('rejects unauthenticated requests', async () => {
      await expect(
        startTraktZipImportHandler({
          auth: undefined,
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'unauthenticated',
      });
    });

    it('rejects non-Premium users', async () => {
      // User doc exists with premium = false
      store.set(`users/${userId}`, {
        email: 'free@example.com',
        premium: { isPremium: false },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'permission-denied',
        message: 'Trakt zip import requires Premium.',
      });
    });

    it('rejects missing or malformed importId', async () => {
      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId: '' },
        } as any)
      ).rejects.toMatchObject({
        code: 'invalid-argument',
      });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId: '../invalid/path' },
        } as any)
      ).rejects.toMatchObject({
        code: 'invalid-argument',
      });
    });

    it('rejects when the Storage zip file does not exist', async () => {
      // User is premium
      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
      });

      // Storage file does not exist
      storageFiles.set(storagePath, { content: Buffer.from(''), exists: false });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'not-found',
      });

      // Task must not be enqueued
      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('creates initial progress doc and enqueues Cloud Task on success', async () => {
      // User is premium
      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
      });

      // Storage file exists
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      const response = await startTraktZipImportHandler({
        auth: { uid: userId },
        data: { importId },
      } as any);

      expect(response).toEqual({ importId });

      // Verify Firestore progress doc was initialized
      const progressDoc = store.get(progressDocPath);
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('pending');
      expect(progressDoc?.progress).toMatchObject({ current: 0, phase: 'pending', total: 100 });
      expect(progressDoc?.userId).toBe(userId);

      // Verify Cloud Task was enqueued with correct payload
      expect(mockEnqueue).toHaveBeenCalledWith(
        { importId, userId },
        expect.objectContaining({
          dispatchDeadlineSeconds: 1800,
          id: `zip_import_${importId}`,
        })
      );
    });

    it('rejects when a Trakt sync is already active', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktSyncStatus: { status: 'in_progress' },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'already-exists',
        message: 'A Trakt sync is already in progress.',
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('rejects when another Trakt zip import is already active', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: { id: 'zip_old_1', status: 'processing' },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'already-exists',
        message: 'A Trakt zip import is already in progress.',
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('rejects with resource-exhausted and retry details when the 6-hour import cooldown is active', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: {
          error: 'sync exploded mid-flight',
          errorCategory: 'in_flight',
          failedAt: MockTimestamp.now(),
          id: 'zip_old_1',
          nextAllowedImportAt: MockTimestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          phase: 'failed',
          status: 'failed',
        },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'resource-exhausted',
        message: 'Please wait before starting another Trakt zip import.',
        details: { nextAllowedImportAt: expect.any(String) },
      });

      expect(mockEnqueue).not.toHaveBeenCalled();
    });

    it('checks the cooldown only after the active-import guard (active import wins)', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: {
          id: 'zip_old_1',
          nextAllowedImportAt: MockTimestamp.fromMillis(Date.now() + 60 * 60 * 1000),
          status: 'processing',
          updatedAt: MockTimestamp.now(),
        },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'already-exists',
      });
    });

    it('allows a new import once the cooldown has expired', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: {
          error: 'sync exploded mid-flight',
          errorCategory: 'in_flight',
          failedAt: MockTimestamp.fromMillis(Date.now() - 7 * 60 * 60 * 1000),
          id: 'zip_old_1',
          nextAllowedImportAt: MockTimestamp.fromMillis(Date.now() - 60 * 60 * 1000),
          phase: 'failed',
          status: 'failed',
        },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      const response = await startTraktZipImportHandler({
        auth: { uid: userId },
        data: { importId },
      } as any);

      expect(response).toEqual({ importId });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });

    it('recovers and starts a new import if previous pending import is stale (> 5 minutes)', async () => {
      const staleTime = MockTimestamp.fromMillis(Date.now() - 6 * 60 * 1000);
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: staleTime,
          id: 'zip_stale_1',
          status: 'pending',
          updatedAt: staleTime,
        },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      const response = await startTraktZipImportHandler({
        auth: { uid: userId },
        data: { importId },
      } as any);

      expect(response).toEqual({ importId });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);

      const userDoc = store.get(`users/${userId}`);
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        status: 'pending',
      });
    });

    it('recovers and starts a new import if previous processing import is stale (> 35 minutes)', async () => {
      const staleTime = MockTimestamp.fromMillis(Date.now() - 40 * 60 * 1000);
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: staleTime,
          id: 'zip_stale_2',
          status: 'processing',
          updatedAt: staleTime,
        },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      const response = await startTraktZipImportHandler({
        auth: { uid: userId },
        data: { importId },
      } as any);

      expect(response).toEqual({ importId });
      expect(mockEnqueue).toHaveBeenCalledTimes(1);
    });

    it('cleans up and marks progress and user doc failed when task enqueue fails', async () => {
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
      });
      storageFiles.set(storagePath, { content: Buffer.from('zip-content'), exists: true });

      mockEnqueue.mockRejectedValueOnce(new Error('Task queue unavailable'));

      await expect(
        startTraktZipImportHandler({
          auth: { uid: userId },
          data: { importId },
        } as any)
      ).rejects.toMatchObject({
        code: 'internal',
        message: 'Failed to start background import task. Please try again.',
      });

      const userDoc = store.get(`users/${userId}`);
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        phase: 'failed',
        status: 'failed',
      });

      const progressDoc = store.get(progressDocPath);
      expect(progressDoc?.status).toBe('failed');
      expect(progressDoc?.error).toContain('Failed to enqueue');
    });
  });

  describe('runTraktZipImport', () => {
    const createValidZipBuffer = (): Buffer => {
      const zip = new SafeAdmZip();
      zip.addFile(
        'history-movies-1.json',
        Buffer.from(
          JSON.stringify([
            {
              action: 'watch',
              movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
              watched_at: '2023-01-01T12:00:00.000Z',
            },
          ])
        )
      );
      zip.addFile(
        'ratings-movies-1.json',
        Buffer.from(
          JSON.stringify([
            {
              movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
              rated_at: '2023-01-01T12:00:00.000Z',
              rating: 10,
              type: 'movie',
            },
          ])
        )
      );
      return zip.toBuffer();
    };

    it('downloads, parses, syncs, updates progress to completed, and cleans up Storage', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // 1. Verify progress doc completed status and stats
      const progressDoc = store.get(progressDocPath);
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('completed');
      expect(progressDoc?.progress).toMatchObject({ current: 100, phase: 'completed', total: 100 });
      expect(progressDoc?.completedAt).toBeDefined();
      expect(progressDoc?.stats).toEqual({
        customLists: 0,
        episodes: 0,
        favorites: 0,
        movies: 1,
        movieWatches: 1,
        ratings: 1,
        shows: 0,
        watchlist: 0,
      });

      // 1b. Verify the 6-hour import cooldown was written to both documents
      const cooldownFloor = Date.now() + 6 * 60 * 60 * 1000 - 60_000;
      const cooldownCeiling = Date.now() + 6 * 60 * 60 * 1000 + 60_000;
      const progressCooldown = (progressDoc?.nextAllowedImportAt as any)?.toMillis?.();
      expect(progressCooldown).toBeGreaterThanOrEqual(cooldownFloor);
      expect(progressCooldown).toBeLessThanOrEqual(cooldownCeiling);

      const userZipCooldown = (store.get(`users/${userId}`) as any)?.traktZipImportStatus
        ?.nextAllowedImportAt?.toMillis?.();
      expect(userZipCooldown).toBeGreaterThanOrEqual(cooldownFloor);
      expect(userZipCooldown).toBeLessThanOrEqual(cooldownCeiling);

      // 2. Verify storage cleanup was called
      expect(fileDeleteCalls).toContain(storagePath);

      // 3. Verify enrichment was prepared on the user doc and dispatched with matching runId
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktEnrichmentStatus).toBeDefined();
      expect(userDoc?.traktEnrichmentStatus?.status).toBe('queued');
      expect(userDoc?.traktEnrichmentStatus?.lists).toEqual(['already-watched']);
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          includeEpisodes: false,
          lists: ['already-watched'],
          runId: userDoc.traktEnrichmentStatus.runId,
          userId,
        }),
        expect.any(Object)
      );
    });

    it('prepares and dispatches enrichment even when user has a pre-existing runId and future cooldown timestamp', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      // Pre-seed user with an older runId and future nextAllowedEnrichAt cooldown
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktEnrichmentStatus: {
          nextAllowedEnrichAt: MockTimestamp.fromMillis(Date.now() + 86400000),
          runId: 'old_oauth_enrichment_run_999',
          status: 'completed',
        },
      });

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktEnrichmentStatus?.status).toBe('queued');
      expect(userDoc?.traktEnrichmentStatus?.runId).not.toBe('old_oauth_enrichment_run_999');

      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          includeEpisodes: false,
          lists: ['already-watched'],
          runId: userDoc.traktEnrichmentStatus.runId,
          userId,
        }),
        expect.any(Object)
      );
    });

    it('merges new lists into pendingLists when an enrichment run is currently active', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      // Pre-seed user with an active (in_progress) enrichment run
      store.set(`users/${userId}`, {
        premium: { isPremium: true },
        traktEnrichmentStatus: {
          lists: ['watchlist'],
          pendingLists: ['favorites'],
          runId: 'active_run_123',
          status: 'in_progress',
        },
      });

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktEnrichmentStatus?.status).toBe('in_progress');
      expect(userDoc?.traktEnrichmentStatus?.runId).toBe('active_run_123');
      // Should have merged existing pendingLists ('favorites') and newly added lists ('already-watched')
      expect(userDoc?.traktEnrichmentStatus?.pendingLists).toEqual(
        expect.arrayContaining(['favorites', 'already-watched'])
      );
    });

    it('writes failed status with a usable error message when Storage download fails, and cleans up storage', async () => {
      storageFiles.set(storagePath, { content: Buffer.from(''), exists: true });
      mockFileDownloadOverride = jest.fn().mockRejectedValueOnce(
        new Error('Network connection timeout during Storage download')
      );

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      const progressDoc = store.get(progressDocPath);
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('failed');
      expect(progressDoc?.error).toContain('Network connection timeout during Storage download');
      expect(progressDoc?.failedAt).toBeDefined();

      // In-flight failures apply the 6-hour cooldown on the user doc status
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        errorCategory: 'in_flight',
        phase: 'failed',
        status: 'failed',
      });
      const cooldown = userDoc?.traktZipImportStatus?.nextAllowedImportAt?.toMillis?.();
      expect(cooldown).toBeGreaterThanOrEqual(Date.now() + 6 * 60 * 60 * 1000 - 60_000);
      expect(cooldown).toBeLessThanOrEqual(Date.now() + 6 * 60 * 60 * 1000 + 60_000);

      // Storage cleanup occurred in finally block
      expect(fileDeleteCalls).toContain(storagePath);
    });

    it('writes failed status with a usable error message when zip parsing throws, and cleans up storage', async () => {
      // Corrupted zip buffer (not a valid zip file)
      const corruptedBuffer = Buffer.from('this is not a zip file archive');
      storageFiles.set(storagePath, { content: corruptedBuffer, exists: true });

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // Verify progress doc status is failed with error
      const progressDoc = store.get(progressDocPath);
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('failed');
      expect(progressDoc?.error).toBeDefined();
      expect(progressDoc?.failedAt).toBeDefined();

      // Corrupt archives are pre-flight failures: classified, but no cooldown applied
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        errorCategory: 'pre_flight',
        phase: 'failed',
        status: 'failed',
      });
      expect(userDoc?.traktZipImportStatus?.error).toContain('Failed to read Trakt export archive');
      expect('nextAllowedImportAt' in (userDoc?.traktZipImportStatus ?? {})).toBe(false);

      // Verify storage cleanup was still called in finally block
      expect(fileDeleteCalls).toContain(storagePath);
    });

    it('writes failed status with a usable error message when syncing throws, and cleans up storage', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      // Mock Firestore batch.commit to reject during sync phase
      const originalBatch = mockFirestore.batch;
      mockFirestore.batch = () => ({
        commit: jest.fn().mockRejectedValueOnce(new Error('Firestore write quota exceeded')),
        delete: jest.fn(),
        set: jest.fn(),
      } as any);

      try {
        await runTraktZipImportHandler({
          data: { importId, userId },
        } as any);

        const progressDoc = store.get(progressDocPath) as any;
        expect(progressDoc).toBeDefined();
        expect(progressDoc?.status).toBe('failed');
        expect(progressDoc?.progress?.phase).toBe('failed');
        expect(progressDoc?.error).toContain('Firestore write quota exceeded');
        expect(progressDoc?.failedAt).toBeDefined();

        // Storage cleanup occurred in finally block
        expect(fileDeleteCalls).toContain(storagePath);
      } finally {
        mockFirestore.batch = originalBatch;
      }
    });

    it('rejects oversized archives before downloading and writes failed status', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      mockFileMetadataOverride = jest.fn().mockResolvedValueOnce([{ size: 250 * 1024 * 1024 }]);

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      const progressDoc = store.get(progressDocPath) as any;
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('failed');
      expect(progressDoc?.progress?.phase).toBe('failed');
      expect(progressDoc?.error).toContain('exceeds the 200MB maximum allowed limit');

      // Oversized archives are pre-flight failures: classified, but no cooldown applied
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        errorCategory: 'pre_flight',
        status: 'failed',
      });
      expect('nextAllowedImportAt' in (userDoc?.traktZipImportStatus ?? {})).toBe(false);

      // Storage cleanup occurred in finally block
      expect(fileDeleteCalls).toContain(storagePath);
    });

    it('still writes completed status even if post-import enrichment dispatch fails afterward', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      // Mock enqueue to reject during post-import enrichment
      mockEnqueue.mockRejectedValueOnce(new Error('Cloud Tasks queue quota exceeded'));

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // Verify progress doc status remains 'completed' and did NOT regress to 'failed'
      const progressDoc = store.get(progressDocPath) as any;
      expect(progressDoc).toBeDefined();
      expect(progressDoc?.status).toBe('completed');
      expect(progressDoc?.stats?.movies).toBe(1);

      // Storage cleanup occurred
      expect(fileDeleteCalls).toContain(storagePath);
    });

    it('skips obsolete task immediately and preserves newer import status when zip_old is replaced by zip_new', async () => {
      const oldImportId = 'zip_old_111111111_aaaaaa';
      const newImportId = 'zip_new_222222222_bbbbbb';
      const oldStoragePath = `users/${userId}/imports/${oldImportId}.zip`;

      const zipBuffer = createValidZipBuffer();
      storageFiles.set(oldStoragePath, { content: zipBuffer, exists: true });

      // User document already has zip_new active
      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: MockTimestamp.now(),
          id: newImportId,
          phase: 'pending',
          status: 'pending',
          updatedAt: MockTimestamp.now(),
        },
      });

      // Execute delayed runTraktZipImport task for oldImportId
      await runTraktZipImportHandler({
        data: { importId: oldImportId, userId },
      } as any);

      // Verify user document status was NOT overwritten by oldImportId
      const userDoc = store.get(`users/${userId}`);
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: newImportId,
        status: 'pending',
      });

      // Verify old progress doc was NOT marked completed
      const oldProgressDoc = store.get(`users/${userId}/trakt_imports/${oldImportId}`);
      expect(oldProgressDoc?.status).toBeUndefined();

      // Verify obsolete storage zip file was cleaned up
      expect(fileDeleteCalls).toContain(oldStoragePath);
    });

    it('rejects duplicate same-ID tasks when an active processing lease already exists', async () => {
      const recentTime = MockTimestamp.fromMillis(Date.now() - 30_000);
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: recentTime,
          id: importId,
          leaseToken: 'lease_active_worker_1',
          phase: 'syncing',
          status: 'processing',
          updatedAt: recentTime,
        },
      });

      // Execute duplicate runTraktZipImport task for same importId
      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // Verify the active worker's leaseToken was NOT overwritten
      const userDoc = store.get(`users/${userId}`);
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        leaseToken: 'lease_active_worker_1',
        phase: 'syncing',
        status: 'processing',
      });
    });

    it('allows a new same-ID task to replace a paused worker when the processing lease is explicitly stale (> 35 minutes)', async () => {
      const staleTime = MockTimestamp.fromMillis(Date.now() - 40 * 60 * 1000);
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: staleTime,
          id: importId,
          leaseToken: 'lease_stale_paused_worker',
          phase: 'downloading',
          status: 'processing',
          updatedAt: staleTime,
        },
      });

      // Execute new runTraktZipImport task for same importId
      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // Verify new worker acquired lease and completed successfully
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktZipImportStatus).toMatchObject({
        id: importId,
        phase: 'completed',
        status: 'completed',
      });
      expect(userDoc?.traktZipImportStatus?.leaseToken).not.toBe('lease_stale_paused_worker');
    });

    it('aborts worker without writes when lease ownership is lost before syncTraktZipImport', async () => {
      const zipBuffer = createValidZipBuffer();
      storageFiles.set(storagePath, { content: zipBuffer, exists: true });

      store.set(`users/${userId}`, {
        email: 'pro@example.com',
        premium: { isPremium: true },
        traktZipImportStatus: {
          createdAt: MockTimestamp.now(),
          id: importId,
          phase: 'pending',
          status: 'pending',
          updatedAt: MockTimestamp.now(),
        },
      });

      // In the middle of processing, another task claims the lease
      const originalDocSet = store.set.bind(store);
      store.set = jest.fn((key: string, value: Record<string, unknown>) => {
        if (key === `users/${userId}` && (value as any)?.traktZipImportStatus?.phase === 'parsing') {
          // Simulate a newer worker taking over the lease before syncing
          const hijacked = {
            ...value,
            traktZipImportStatus: {
              ...(value as any).traktZipImportStatus,
              leaseToken: 'lease_newer_takeover_token',
            },
          };
          return originalDocSet(key, hijacked);
        }
        return originalDocSet(key, value);
      });

      await runTraktZipImportHandler({
        data: { importId, userId },
      } as any);

      // Verify the user doc was NOT completed by the lost worker
      const userDoc = store.get(`users/${userId}`) as any;
      expect(userDoc?.traktZipImportStatus?.leaseToken).toBe('lease_newer_takeover_token');
      expect(userDoc?.traktZipImportStatus?.status).not.toBe('completed');
    });
  });

  describe('zipParser pre-flight error classes', () => {
    const createValidZipBuffer = (): Buffer => {
      const zip = new SafeAdmZip();
      zip.addFile(
        'history-movies-1.json',
        Buffer.from(
          JSON.stringify([
            {
              action: 'watch',
              movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
              watched_at: '2023-01-01T12:00:00.000Z',
            },
          ])
        )
      );
      return zip.toBuffer();
    };

    it('classifies unreadable archives as TraktZipCorruptArchiveError (pre-flight)', () => {
      expect.assertions(4);
      try {
        parseTraktZipBuffer(Buffer.from('this is not a zip file archive'));
        fail('expected parseTraktZipBuffer to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(TraktZipCorruptArchiveError);
        expect(error).not.toBeInstanceOf(TraktZipSizeLimitError);
        expect((error as TraktZipCorruptArchiveError).isPreFlight).toBe(true);
        expect((error as Error).message).toContain('Failed to read Trakt export archive');
      }
    });

    it('classifies size-limit violations as TraktZipSizeLimitError (pre-flight)', () => {
      expect.assertions(4);
      try {
        parseTraktZipBuffer(createValidZipBuffer(), { maxEntrySizeBytes: 10 });
        fail('expected parseTraktZipBuffer to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(TraktZipSizeLimitError);
        expect(error).not.toBeInstanceOf(TraktZipCorruptArchiveError);
        expect((error as TraktZipSizeLimitError).isPreFlight).toBe(true);
        expect((error as Error).message).toContain('exceeds the maximum allowed limit');
      }
    });

    it('leaves integrity-check failures as plain errors (in-flight classification)', () => {
      expect.assertions(3);
      // A ratings file whose only entry is invalid (rating out of range) produces
      // zero valid ratings, tripping the integrity check after real parsing.
      const zip = new SafeAdmZip();
      zip.addFile(
        'ratings-movies-1.json',
        Buffer.from(
          JSON.stringify([
            {
              movie: { ids: { tmdb: 278 }, title: 'The Shawshank Redemption', year: 1994 },
              rated_at: '2023-01-01T12:00:00.000Z',
              rating: 99,
              type: 'movie',
            },
          ])
        )
      );

      try {
        parseTraktZipBuffer(zip.toBuffer());
        fail('expected parseTraktZipBuffer to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(TraktZipSizeLimitError);
        expect((error as Error).message).toContain('integrity check failed');
      }
    });
  });
});
