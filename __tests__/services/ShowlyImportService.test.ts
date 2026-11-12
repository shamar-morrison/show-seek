import {
  createEmptyFileImportStats,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { SHOWLY_MAX_EXPORT_BYTES } from '@/src/utils/showlyImport/files';
import type { PreparedShowlyImport } from '@/src/utils/showlyImport/prepare';

const USER = 'user-1';

function chunkStats(watchedEpisodes: number, unmatchedEpisodeTitles?: string[]): FileImportStats {
  const stats = createEmptyFileImportStats();
  stats.imported.watchedEpisodes = watchedEpisodes;
  stats.processedEntities = 1;
  if (unmatchedEpisodeTitles) stats.unmatchedEpisodeTitles = unmatchedEpisodeTitles;
  return stats;
}

function prepared(chunkCount: number): PreparedShowlyImport {
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
          tmdbId: index + 1,
          tvdbId: null,
        },
      ],
    })),
    format: 'json',
    stats: createEmptyFileImportStats(),
    summary: {
      customLists: 0,
      dropped: 0,
      emptyLists: 0,
      episodes: 0,
      following: 0,
      movieWatchlist: 0,
      ratings: 0,
      showWatchlist: chunkCount,
      watchedMovies: 0,
    },
  };
}

function callableError(code: string, details?: unknown) {
  return Object.assign(new Error(code), { code: `functions/${code}`, details });
}

function loadService() {
  const mockCallable = jest.fn();
  const httpsCallable = jest.fn(() => mockCallable);
  const firestore = {
    doc: jest.fn((...path: unknown[]) => ({ path: path.slice(1).join('/') })),
    getDoc: jest.fn(async (): Promise<{ data: () => unknown }> => ({ data: () => undefined })),
  };
  const documentPicker = { getDocumentAsync: jest.fn() };
  const fileSystem = { EncodingType: { Base64: 'base64' }, readAsStringAsync: jest.fn() };
  const keepAwake = {
    activateKeepAwakeAsync: jest.fn(async () => undefined),
    deactivateKeepAwake: jest.fn(),
  };
  jest.doMock('@/src/firebase/config', () => ({ db: {}, functions: {} }));
  jest.doMock('firebase/functions', () => ({ httpsCallable }));
  jest.doMock('firebase/firestore', () => firestore);
  jest.doMock('expo-keep-awake', () => keepAwake, { virtual: true });
  jest.doMock('expo-document-picker', () => documentPicker, { virtual: true });
  jest.doMock('expo-file-system/legacy', () => fileSystem, { virtual: true });
  const module =
    require('@/src/services/ShowlyImportService') as typeof import('@/src/services/ShowlyImportService');
  return {
    AsyncStorage: asyncStorage(),
    documentPicker,
    fileSystem,
    firestore,
    httpsCallable,
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

describe('ShowlyImportService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await asyncStorage().clear();
  });

  it('calls importShowlyChunk, never the Simkl or TV Time callables', () => {
    const { httpsCallable } = loadService();
    expect(httpsCallable).toHaveBeenCalledWith({}, 'importShowlyChunk', { timeout: 300_000 });
    expect(httpsCallable).not.toHaveBeenCalledWith(
      expect.anything(),
      'importTvTimeChunk',
      expect.anything()
    );
  });

  it('reads its own rate-limit doc', async () => {
    const { showlyImportService, firestore } = loadService();
    firestore.getDoc.mockResolvedValueOnce({
      data: () => ({ session: { id: 'showly-run', nextAllowedImportAt: 123 } }),
    });

    await expect(showlyImportService.getLimitState(USER)).resolves.toEqual({
      activeImportId: 'showly-run',
      nextAllowedImportAt: 123,
    });
    expect(firestore.doc).toHaveBeenCalledWith({}, 'users', USER, 'import_limits', 'showly');
  });

  it('sends every chunk with one importId, merges stats (unmatched titles too), keeps the screen awake, and clears the run', async () => {
    const { showlyImportService, mockCallable, keepAwake, AsyncStorage } = loadService();
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(3, ['Futurama']) })
      .mockResolvedValueOnce({ data: chunkStats(4, ['Doctor Who']) });
    const progress: number[] = [];

    const result = await settle(
      showlyImportService.runPreparedImport(prepared(2), USER, (p) =>
        progress.push(p.completedChunks)
      )
    );

    expect(result.stats.imported.watchedEpisodes).toBe(7);
    expect(result.stats.unmatchedEpisodeTitles).toEqual(['Futurama', 'Doctor Who']);
    expect(result.failedChunkIndexes).toEqual([]);
    const ids = mockCallable.mock.calls.map(([request]) => request.importId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^showly-[A-Za-z0-9-]{8,58}$/);
    expect(progress).toEqual([0, 1, 2]);
    expect(mockCallable.mock.calls.map(([request]) => request.final)).toEqual([undefined, true]);
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('showly-import');
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith('showly-import');
    expect(await AsyncStorage.getItem(`showlyImport:activeRun:${USER}`)).toBeNull();
  });

  it('retries transient failures, then reports the chunk as failed without stopping the run', async () => {
    const { showlyImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(callableError('unavailable'))
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('deadline-exceeded'))
      .mockRejectedValueOnce(callableError('internal'))
      .mockRejectedValueOnce(callableError('unavailable'))
      .mockResolvedValueOnce({ data: chunkStats(2) });

    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await settle(showlyImportService.runPreparedImport(prepared(3), USER));
    spy.mockRestore();

    expect(result.failedChunkIndexes).toEqual([1]);
    expect(result.stats.imported.watchedEpisodes).toBe(3);
    expect(mockCallable).toHaveBeenCalledTimes(6);
  });

  it('waits out burst limits instead of failing', async () => {
    const { showlyImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(
        callableError('resource-exhausted', { reason: 'burst', retryAfterMs: 4_000 })
      )
      .mockResolvedValueOnce({ data: chunkStats(1) });

    const result = await settle(showlyImportService.runPreparedImport(prepared(1), USER));

    expect(result.failedChunkIndexes).toEqual([]);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('stops on a cooldown refusal, keeps a partly sent run, and resumes it with the same importId', async () => {
    const { showlyImportService, mockCallable, ShowlyImportRunError, AsyncStorage } = loadService();
    const job = prepared(3);
    const details = {
      nextAllowedImportAt: '2026-11-11T12:00:00.000Z',
      reason: 'cooldown',
      retryAfterMs: 1,
    };
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('resource-exhausted', details));

    const error = await settle(showlyImportService.runPreparedImport(job, USER)).catch((e) => e);
    expect(error).toBeInstanceOf(ShowlyImportRunError);
    expect(error).toMatchObject({ code: 'resource-exhausted', details });
    expect(await AsyncStorage.getItem(`showlyImport:activeRun:${USER}`)).not.toBeNull();
    expect(await AsyncStorage.getItem(`tvtimeImport:activeRun:${USER}`)).toBeNull();
    const firstId = mockCallable.mock.calls[0][0].importId;

    mockCallable.mockReset();
    mockCallable.mockResolvedValue({ data: chunkStats(1) });
    const result = await settle(showlyImportService.runPreparedImport(job, USER));

    expect(mockCallable.mock.calls.every(([request]) => request.importId === firstId)).toBe(true);
    expect(mockCallable.mock.calls.map(([request]) => request.shows[0].tmdbId)).toEqual([2, 3]);
    expect(result.stats.imported.watchedEpisodes).toBe(3);
  });

  it('forgets a run the server refused before any chunk got through', async () => {
    const { showlyImportService, mockCallable, AsyncStorage } = loadService();
    mockCallable.mockRejectedValueOnce(
      callableError('already-exists', { reason: 'in_progress', retryAfterMs: 60_000 })
    );

    await expect(
      settle(showlyImportService.runPreparedImport(prepared(2), USER))
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(await AsyncStorage.getItem(`showlyImport:activeRun:${USER}`)).toBeNull();
  });

  it('picks a single file, refuses oversized picks before reading them, and reports unreadable files', async () => {
    const { showlyImportService, documentPicker, fileSystem } = loadService();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'showly_export.json', size: SHOWLY_MAX_EXPORT_BYTES + 1, uri: 'file:///a' }],
      canceled: false,
    });
    await expect(showlyImportService.pickFiles()).rejects.toMatchObject({ code: 'too_large' });
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(documentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, type: '*/*' })
    );

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'showly_export.json', size: 10, uri: 'content://drive/a' }],
      canceled: false,
    });
    fileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('not downloaded'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(showlyImportService.pickFiles()).rejects.toMatchObject({
      code: 'unreadable_file',
    });
    spy.mockRestore();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'showly_export.json', size: 3, uri: 'file:///b' }],
      canceled: false,
    });
    fileSystem.readAsStringAsync.mockResolvedValueOnce(Buffer.from('{}').toString('base64'));
    const files = await showlyImportService.pickFiles();
    expect(Buffer.from(files[0].bytes).toString('utf8')).toBe('{}');
  });

  it('tells apart backups whose counts match but whose content differs', () => {
    const { fingerprintOf } = loadService();
    const a = prepared(2);
    const b = prepared(2);
    b.chunks[1].shows[0].title = 'Another show';

    expect(fingerprintOf(a)).toBe(fingerprintOf(prepared(2)));
    expect(fingerprintOf(a)).not.toBe(fingerprintOf(b));
  });
});
