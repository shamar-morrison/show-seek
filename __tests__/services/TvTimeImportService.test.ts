import {
  createEmptyTvTimeImportStats,
  type TvTimeImportStats,
} from '@/functions/src/shared/tvtimeImport';
import { TVTIME_MAX_EXPORT_BYTES } from '@/src/utils/tvtimeImport/files';
import type { PreparedTvTimeImport } from '@/src/utils/tvtimeImport/prepare';

const USER = 'user-1';

function chunkStats(watchedEpisodes: number): TvTimeImportStats {
  const stats = createEmptyTvTimeImportStats();
  stats.imported.watchedEpisodes = watchedEpisodes;
  stats.processedEntities = 1;
  return stats;
}

function prepared(chunkCount: number): PreparedTvTimeImport {
  return {
    chunks: Array.from({ length: chunkCount }, (_, index) => ({
      movies: [],
      shows: [
        {
          addedAt: 1,
          favorite: false,
          imdbId: null,
          lists: [],
          plays: [],
          rating: null,
          status: 'watchlist' as const,
          title: `Show ${index}`,
          tvdbId: index + 1,
        },
      ],
    })),
    format: 'refract',
    stats: createEmptyTvTimeImportStats(),
    summary: {
      episodes: 0,
      favorites: 0,
      lists: 0,
      movieWatches: 0,
      movies: 0,
      ratings: 0,
      shows: chunkCount,
      watchlist: chunkCount,
    },
  };
}

function callableError(code: string, details?: unknown) {
  return Object.assign(new Error(code), { code: `functions/${code}`, details });
}

function loadService() {
  const mockCallable = jest.fn();
  const documentPicker = { getDocumentAsync: jest.fn() };
  const fileSystem = { EncodingType: { Base64: 'base64' }, readAsStringAsync: jest.fn() };
  const keepAwake = {
    activateKeepAwakeAsync: jest.fn(async () => undefined),
    deactivateKeepAwake: jest.fn(),
  };
  jest.doMock('@/src/firebase/config', () => ({ db: {}, functions: {} }));
  jest.doMock('firebase/functions', () => ({ httpsCallable: jest.fn(() => mockCallable) }));
  jest.doMock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
  jest.doMock('expo-keep-awake', () => keepAwake, { virtual: true });
  jest.doMock('expo-document-picker', () => documentPicker, { virtual: true });
  jest.doMock('expo-file-system/legacy', () => fileSystem, { virtual: true });
  const module =
    require('@/src/services/TvTimeImportService') as typeof import('@/src/services/TvTimeImportService');
  return {
    AsyncStorage: asyncStorage(),
    documentPicker,
    fileSystem,
    keepAwake,
    mockCallable,
    ...module,
  };
}

function asyncStorage() {
  const mod = require('@react-native-async-storage/async-storage');
  return mod.default ?? mod;
}

/** Runs a promise to completion while fast-forwarding the service's backoff timers. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  let outcome: { ok: true; value: T } | { ok: false; error: unknown } | null = null;
  promise.then(
    (value) => {
      outcome = { ok: true, value };
    },
    (error) => {
      outcome = { error, ok: false };
    }
  );
  while (outcome === null) {
    await jest.advanceTimersByTimeAsync(1_000);
  }
  const settled = outcome as { ok: true; value: T } | { ok: false; error: unknown };
  if (!settled.ok) throw settled.error;
  return settled.value;
}

describe('TvTimeImportService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await asyncStorage().clear();
  });

  it('sends every chunk with one importId, merges stats, keeps the screen awake, and clears the run', async () => {
    const { tvTimeImportService, mockCallable, keepAwake, AsyncStorage } = loadService();
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(3) })
      .mockResolvedValueOnce({ data: chunkStats(4) });
    const progress: number[] = [];

    const result = await settle(
      tvTimeImportService.runPreparedImport(prepared(2), USER, (p) =>
        progress.push(p.completedChunks)
      )
    );

    expect(result.stats.imported.watchedEpisodes).toBe(7);
    expect(result.failedChunkIndexes).toEqual([]);
    const ids = mockCallable.mock.calls.map(([request]) => request.importId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(progress).toEqual([0, 1, 2]);
    expect(mockCallable.mock.calls.map(([request]) => request.final)).toEqual([undefined, true]);
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalled();
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(`tvtimeImport:activeRun:${USER}`)).toBeNull();
  });

  it('retries transient failures, then reports the chunk as failed without stopping the run', async () => {
    const { tvTimeImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(callableError('unavailable'))
      .mockResolvedValueOnce({ data: chunkStats(1) }) // chunk 0 succeeds on retry
      .mockRejectedValueOnce(callableError('deadline-exceeded'))
      .mockRejectedValueOnce(callableError('internal'))
      .mockRejectedValueOnce(callableError('unavailable')) // chunk 1 gives up after 3 attempts
      .mockResolvedValueOnce({ data: chunkStats(2) }); // chunk 2

    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await settle(tvTimeImportService.runPreparedImport(prepared(3), USER));
    spy.mockRestore();

    expect(result.failedChunkIndexes).toEqual([1]);
    expect(result.stats.imported.watchedEpisodes).toBe(3);
    expect(mockCallable).toHaveBeenCalledTimes(6);
  });

  it('waits out burst limits instead of failing', async () => {
    const { tvTimeImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(
        callableError('resource-exhausted', { reason: 'burst', retryAfterMs: 4_000 })
      )
      .mockResolvedValueOnce({ data: chunkStats(1) });

    const result = await settle(tvTimeImportService.runPreparedImport(prepared(1), USER));

    expect(result.failedChunkIndexes).toEqual([]);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('stops the run on a cooldown refusal and keeps a partly sent run for resuming', async () => {
    const { tvTimeImportService, mockCallable, TvTimeImportRunError, AsyncStorage } = loadService();
    const details = {
      nextAllowedImportAt: '2026-07-01T12:00:00.000Z',
      reason: 'cooldown',
      retryAfterMs: 1,
    };
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('resource-exhausted', details));

    const error = await settle(tvTimeImportService.runPreparedImport(prepared(2), USER)).catch(
      (e) => e
    );
    expect(error).toBeInstanceOf(TvTimeImportRunError);
    expect(error).toMatchObject({ code: 'resource-exhausted', details });
    expect(mockCallable).toHaveBeenCalledTimes(2);
    expect(await AsyncStorage.getItem(`tvtimeImport:activeRun:${USER}`)).not.toBeNull();
  });

  it('forgets a run the server refused before any chunk got through', async () => {
    const { tvTimeImportService, mockCallable, AsyncStorage } = loadService();
    mockCallable.mockRejectedValueOnce(
      callableError('already-exists', { reason: 'in_progress', retryAfterMs: 60_000 })
    );

    await expect(
      settle(tvTimeImportService.runPreparedImport(prepared(2), USER))
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(await AsyncStorage.getItem(`tvtimeImport:activeRun:${USER}`)).toBeNull();
  });

  it('resumes an interrupted run with the same importId and skips finished chunks', async () => {
    const { tvTimeImportService, mockCallable, TvTimeImportRunError } = loadService();
    const job = prepared(3);
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('permission-denied'));

    await expect(settle(tvTimeImportService.runPreparedImport(job, USER))).rejects.toBeInstanceOf(
      TvTimeImportRunError
    );
    const firstId = mockCallable.mock.calls[0][0].importId;

    mockCallable.mockReset();
    mockCallable.mockResolvedValue({ data: chunkStats(1) });
    const result = await settle(tvTimeImportService.runPreparedImport(job, USER));

    expect(mockCallable).toHaveBeenCalledTimes(2); // chunk 0 was already done
    expect(mockCallable.mock.calls.every(([request]) => request.importId === firstId)).toBe(true);
    expect(mockCallable.mock.calls.map(([request]) => request.shows[0].tvdbId)).toEqual([2, 3]);
    expect(mockCallable.mock.calls.map(([request]) => request.final)).toEqual([undefined, true]);
    expect(result.failedChunkIndexes).toEqual([]);
    // The summary covers the chunk sent before the interruption too.
    expect(result.stats.imported.watchedEpisodes).toBe(3);
  });

  it('tells apart exports whose counts match but whose content differs', () => {
    const { fingerprintOf } = loadService();
    const a = prepared(2);
    const b = prepared(2);
    b.chunks[1].shows[0].title = 'Another show';

    expect(fingerprintOf(a)).toBe(fingerprintOf(prepared(2)));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });

  it('refuses oversized picks before reading them, and reports unreadable files', async () => {
    const { tvTimeImportService, documentPicker, fileSystem } = loadService();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'export.zip', size: TVTIME_MAX_EXPORT_BYTES + 1, uri: 'file:///a' }],
      canceled: false,
    });
    await expect(tvTimeImportService.pickFiles()).rejects.toMatchObject({ code: 'too_large' });
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'export.zip', size: 10, uri: 'content://drive/a' }],
      canceled: false,
    });
    fileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('not downloaded'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(tvTimeImportService.pickFiles()).rejects.toMatchObject({
      code: 'unreadable_file',
    });
    spy.mockRestore();
  });

  it('decodes base64 like the platform decoder', () => {
    const { decodeBase64 } = loadService();
    for (const text of ['', 'a', 'ab', 'abc', 'TV Time ✓ 승리호 Don’t', 'x'.repeat(10_001)]) {
      const encoded = Buffer.from(text, 'utf8').toString('base64');
      expect(Buffer.from(decodeBase64(encoded)).toString('utf8')).toBe(text);
    }
  });
});
