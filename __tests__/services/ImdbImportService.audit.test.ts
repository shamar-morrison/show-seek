import type { PreparedImdbImport } from '@/src/utils/imdbImport';
import {
  createEmptyImdbImportStats,
  type ImdbImportStats,
} from '@/functions/src/shared/imdbImport';

describe('ImdbImportService audited progress handling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const baseStats = createEmptyImdbImportStats();
  const preparedImport: PreparedImdbImport = {
    chunks: [{ entities: [{ imdbId: 'tt1', rawTitleType: 'movie', title: 'One', actions: [] }] }, { entities: [{ imdbId: 'tt2', rawTitleType: 'movie', title: 'Two', actions: [] }] }],
    files: [],
    stats: {
      ...baseStats,
      processedActions: 4,
      processedEntities: 2,
    },
    unsupportedFiles: [],
  };

  const createChunkStats = (overrides: Partial<ImdbImportStats>): ImdbImportStats => ({
    ...createEmptyImdbImportStats(),
    ...overrides,
    imported: {
      ...createEmptyImdbImportStats().imported,
      ...(overrides.imported ?? {}),
    },
    ignored: {
      ...(overrides.ignored ?? {}),
    },
    skipped: {
      ...(overrides.skipped ?? {}),
    },
  });

  const loadService = () => {
    const mockCallable = jest.fn();
    jest.doMock('@/src/firebase/config', () => ({
      functions: {},
    }));
    jest.doMock('firebase/functions', () => ({
      httpsCallable: jest.fn(() => mockCallable),
    }));

    const { imdbImportService } = require('@/src/services/ImdbImportService') as typeof import('@/src/services/ImdbImportService');
    return { imdbImportService, mockCallable };
  };

  // Verifies progress events merge prepared stats with successful chunk results across multiple chunks.
  it('aggregates progress events correctly across multiple chunks', async () => {
    const { imdbImportService, mockCallable } = loadService();
    const progressEvents: Array<{ completedChunks: number; stats: ImdbImportStats; totalChunks: number }> = [];
    mockCallable
      .mockResolvedValueOnce({
        data: createChunkStats({
          imported: {
            ...baseStats.imported,
            ratings: 1,
          },
          processedActions: 2,
          processedEntities: 1,
        }),
      })
      .mockResolvedValueOnce({
        data: createChunkStats({
          imported: {
            ...baseStats.imported,
            watchedMovies: 1,
          },
          processedActions: 1,
          processedEntities: 1,
        }),
      });

    await imdbImportService.runPreparedImport(preparedImport, (progress) => {
      progressEvents.push(progress);
    });

    expect(progressEvents).toEqual([
      {
        completedChunks: 0,
        stats: preparedImport.stats,
        totalChunks: 2,
      },
      {
        completedChunks: 1,
        stats: expect.objectContaining({
          imported: expect.objectContaining({ ratings: 1 }),
          processedActions: 4,
          processedEntities: 2,
        }),
        totalChunks: 2,
      },
      {
        completedChunks: 2,
        stats: expect.objectContaining({
          imported: expect.objectContaining({ ratings: 1, watchedMovies: 1 }),
          processedActions: 4,
          processedEntities: 2,
        }),
        totalChunks: 2,
      },
    ]);
  });

  // Verifies one failed chunk is logged and skipped without aborting later chunk imports.
  it('continues the import after a single chunk failure', async () => {
    const { imdbImportService, mockCallable } = loadService();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCallable
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce({
        data: createChunkStats({
          imported: {
            ...baseStats.imported,
            watchedMovies: 1,
          },
          processedActions: 1,
          processedEntities: 1,
        }),
      });

    const result = await imdbImportService.runPreparedImport(preparedImport);

    expect(result).toEqual(
      expect.objectContaining({
        imported: expect.objectContaining({ watchedMovies: 1 }),
        processedActions: 4,
        processedEntities: 2,
      })
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ImdbImportService] Failed to import chunk:',
      expect.objectContaining({
        chunkIndex: 0,
        error: expect.any(Error),
      })
    );
    consoleSpy.mockRestore();
  });

  // Verifies progress after a chunk failure reflects only the successful portion of the import.
  it('reports partial progress accurately after a failed chunk', async () => {
    const { imdbImportService, mockCallable } = loadService();
    const progressEvents: Array<{ completedChunks: number; stats: ImdbImportStats }> = [];
    mockCallable
      .mockRejectedValueOnce(new Error('chunk failed'))
      .mockResolvedValueOnce({
        data: createChunkStats({
          imported: {
            ...baseStats.imported,
            listItems: 2,
          },
          processedActions: 2,
          processedEntities: 1,
        }),
      });

    await imdbImportService.runPreparedImport(preparedImport, (progress) => {
      progressEvents.push({
        completedChunks: progress.completedChunks,
        stats: progress.stats,
      });
    });

    expect(progressEvents[1]).toEqual({
      completedChunks: 1,
      stats: preparedImport.stats,
    });
    expect(progressEvents[2]).toEqual({
      completedChunks: 2,
      stats: expect.objectContaining({
        imported: expect.objectContaining({ listItems: 2 }),
        processedActions: 4,
        processedEntities: 2,
      }),
    });
  });

  // Verifies the final completion progress event still reaches total chunks when some chunks fail.
  it('emits a final completion event even when some chunks fail', async () => {
    const { imdbImportService, mockCallable } = loadService();
    const progressEvents: Array<{ completedChunks: number; totalChunks: number }> = [];
    mockCallable
      .mockResolvedValueOnce({
        data: createChunkStats({
          imported: {
            ...baseStats.imported,
            ratings: 1,
          },
          processedActions: 1,
          processedEntities: 1,
        }),
      })
      .mockRejectedValueOnce(new Error('chunk failed'));

    await imdbImportService.runPreparedImport(preparedImport, (progress) => {
      progressEvents.push({
        completedChunks: progress.completedChunks,
        totalChunks: progress.totalChunks,
      });
    });

    expect(progressEvents[progressEvents.length - 1]).toEqual({
      completedChunks: 2,
      totalChunks: 2,
    });
  });
});
