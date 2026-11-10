import {
  createEmptyFileImportStats,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { SIMKL_MAX_EXPORT_BYTES } from '@/src/utils/simklImport/files';
import type { PreparedSimklImport } from '@/src/utils/simklImport/prepare';

const USER = 'user-1';

function chunkStats(watchedEpisodes: number, unmatchedEpisodeTitles?: string[]): FileImportStats {
  const stats = createEmptyFileImportStats();
  stats.imported.watchedEpisodes = watchedEpisodes;
  stats.processedEntities = 1;
  if (unmatchedEpisodeTitles) stats.unmatchedEpisodeTitles = unmatchedEpisodeTitles;
  return stats;
}

function prepared(chunkCount: number): PreparedSimklImport {
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
      anime: 0,
      episodes: 0,
      movieWatches: 0,
      movies: 0,
      ratings: 0,
      shows: chunkCount,
      summaryOnlyShows: 0,
      watchlist: chunkCount,
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
    require('@/src/services/SimklImportService') as typeof import('@/src/services/SimklImportService');
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

describe('SimklImportService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await asyncStorage().clear();
  });

  it('calls importSimklChunk, never the TV Time callable', () => {
    const { httpsCallable } = loadService();
    expect(httpsCallable).toHaveBeenCalledWith({}, 'importSimklChunk', { timeout: 300_000 });
    expect(httpsCallable).not.toHaveBeenCalledWith(
      expect.anything(),
      'importTvTimeChunk',
      expect.anything()
    );
  });

  it('reads its own rate-limit doc', async () => {
    const { simklImportService, firestore } = loadService();
    firestore.getDoc.mockResolvedValueOnce({
      data: () => ({ session: { id: 'simkl-run', nextAllowedImportAt: 123 } }),
    });

    await expect(simklImportService.getLimitState(USER)).resolves.toEqual({
      activeImportId: 'simkl-run',
      nextAllowedImportAt: 123,
    });
    expect(firestore.doc).toHaveBeenCalledWith({}, 'users', USER, 'import_limits', 'simkl');
  });

  it('sends every chunk with one importId, merges stats (unmatched titles too), keeps the screen awake, and clears the run', async () => {
    const { simklImportService, mockCallable, keepAwake, AsyncStorage } = loadService();
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(3, ['Futurama']) })
      .mockResolvedValueOnce({ data: chunkStats(4, ['Doctor Who']) });
    const progress: number[] = [];

    const result = await settle(
      simklImportService.runPreparedImport(prepared(2), USER, (p) =>
        progress.push(p.completedChunks)
      )
    );

    expect(result.stats.imported.watchedEpisodes).toBe(7);
    expect(result.stats.unmatchedEpisodeTitles).toEqual(['Futurama', 'Doctor Who']);
    expect(result.failedChunkIndexes).toEqual([]);
    const ids = mockCallable.mock.calls.map(([request]) => request.importId);
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toMatch(/^simkl-[A-Za-z0-9-]{8,58}$/);
    expect(progress).toEqual([0, 1, 2]);
    expect(mockCallable.mock.calls.map(([request]) => request.final)).toEqual([undefined, true]);
    expect(keepAwake.activateKeepAwakeAsync).toHaveBeenCalledWith('simkl-import');
    expect(keepAwake.deactivateKeepAwake).toHaveBeenCalledWith('simkl-import');
    expect(await AsyncStorage.getItem(`simklImport:activeRun:${USER}`)).toBeNull();
  });

  it('retries transient failures, then reports the chunk as failed without stopping the run', async () => {
    const { simklImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(callableError('unavailable'))
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('deadline-exceeded'))
      .mockRejectedValueOnce(callableError('internal'))
      .mockRejectedValueOnce(callableError('unavailable'))
      .mockResolvedValueOnce({ data: chunkStats(2) });

    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = await settle(simklImportService.runPreparedImport(prepared(3), USER));
    spy.mockRestore();

    expect(result.failedChunkIndexes).toEqual([1]);
    expect(result.stats.imported.watchedEpisodes).toBe(3);
    expect(mockCallable).toHaveBeenCalledTimes(6);
  });

  it('waits out burst limits instead of failing', async () => {
    const { simklImportService, mockCallable } = loadService();
    mockCallable
      .mockRejectedValueOnce(
        callableError('resource-exhausted', { reason: 'burst', retryAfterMs: 4_000 })
      )
      .mockResolvedValueOnce({ data: chunkStats(1) });

    const result = await settle(simklImportService.runPreparedImport(prepared(1), USER));

    expect(result.failedChunkIndexes).toEqual([]);
    expect(mockCallable).toHaveBeenCalledTimes(2);
  });

  it('stops on a cooldown refusal, keeps a partly sent run, and resumes it with the same importId', async () => {
    const { simklImportService, mockCallable, SimklImportRunError, AsyncStorage } = loadService();
    const job = prepared(3);
    const details = {
      nextAllowedImportAt: '2026-11-11T12:00:00.000Z',
      reason: 'cooldown',
      retryAfterMs: 1,
    };
    mockCallable
      .mockResolvedValueOnce({ data: chunkStats(1) })
      .mockRejectedValueOnce(callableError('resource-exhausted', details));

    const error = await settle(simklImportService.runPreparedImport(job, USER)).catch((e) => e);
    expect(error).toBeInstanceOf(SimklImportRunError);
    expect(error).toMatchObject({ code: 'resource-exhausted', details });
    expect(await AsyncStorage.getItem(`simklImport:activeRun:${USER}`)).not.toBeNull();
    expect(await AsyncStorage.getItem(`tvtimeImport:activeRun:${USER}`)).toBeNull();
    const firstId = mockCallable.mock.calls[0][0].importId;

    mockCallable.mockReset();
    mockCallable.mockResolvedValue({ data: chunkStats(1) });
    const result = await settle(simklImportService.runPreparedImport(job, USER));

    expect(mockCallable.mock.calls.every(([request]) => request.importId === firstId)).toBe(true);
    expect(mockCallable.mock.calls.map(([request]) => request.shows[0].tmdbId)).toEqual([2, 3]);
    expect(result.stats.imported.watchedEpisodes).toBe(3);
  });

  it('forgets a run the server refused before any chunk got through', async () => {
    const { simklImportService, mockCallable, AsyncStorage } = loadService();
    mockCallable.mockRejectedValueOnce(
      callableError('already-exists', { reason: 'in_progress', retryAfterMs: 60_000 })
    );

    await expect(
      settle(simklImportService.runPreparedImport(prepared(2), USER))
    ).rejects.toMatchObject({ code: 'already-exists' });
    expect(await AsyncStorage.getItem(`simklImport:activeRun:${USER}`)).toBeNull();
  });

  it('picks a single file, refuses oversized picks before reading them, and reports unreadable files', async () => {
    const { simklImportService, documentPicker, fileSystem } = loadService();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'SimklBackup.zip', size: SIMKL_MAX_EXPORT_BYTES + 1, uri: 'file:///a' }],
      canceled: false,
    });
    await expect(simklImportService.pickFiles()).rejects.toMatchObject({ code: 'too_large' });
    expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(documentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, type: '*/*' })
    );

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'SimklBackup.zip', size: 10, uri: 'content://drive/a' }],
      canceled: false,
    });
    fileSystem.readAsStringAsync.mockRejectedValueOnce(new Error('not downloaded'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(simklImportService.pickFiles()).rejects.toMatchObject({
      code: 'unreadable_file',
    });
    spy.mockRestore();

    documentPicker.getDocumentAsync.mockResolvedValueOnce({
      assets: [{ name: 'SimklBackup.zip', size: 3, uri: 'file:///b' }],
      canceled: false,
    });
    fileSystem.readAsStringAsync.mockResolvedValueOnce(Buffer.from('{}').toString('base64'));
    const files = await simklImportService.pickFiles();
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
