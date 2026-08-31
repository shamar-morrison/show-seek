describe('TraktZipImportService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  describe('generateImportId', () => {
    it('generates unique import IDs prefixed with zip_', () => {
      const { generateImportId } = require('@/src/services/TraktZipImportService');
      const id1 = generateImportId();
      const id2 = generateImportId();

      expect(id1).toMatch(/^zip_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^zip_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toEqual(id2);
    });
  });

  describe('pickZipFile', () => {
    it('returns selected zip file metadata when user picks a .zip archive', async () => {
      const mockGetDocumentAsync = jest.fn().mockResolvedValue({
        assets: [
          {
            name: 'trakt-export-2026.zip',
            size: 1024 * 500,
            uri: 'file:///cache/trakt-export-2026.zip',
          },
        ],
        canceled: false,
      });

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));

      const { traktZipImportService } = require('@/src/services/TraktZipImportService');
      traktZipImportService.setDocumentPickerModuleForTest({
        getDocumentAsync: mockGetDocumentAsync,
      } as any);

      const file = await traktZipImportService.pickZipFile();

      expect(file).toEqual({
        name: 'trakt-export-2026.zip',
        size: 512000,
        uri: 'file:///cache/trakt-export-2026.zip',
      });
      expect(mockGetDocumentAsync).toHaveBeenCalledWith({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });
    });

    it('returns null when document picker is canceled', async () => {
      const mockGetDocumentAsync = jest.fn().mockResolvedValue({
        assets: [],
        canceled: true,
      });

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));

      const { traktZipImportService } = require('@/src/services/TraktZipImportService');
      traktZipImportService.setDocumentPickerModuleForTest({
        getDocumentAsync: mockGetDocumentAsync,
      } as any);

      const file = await traktZipImportService.pickZipFile();

      expect(file).toBeNull();
    });

    it('rejects files that do not have a .zip extension', async () => {
      const mockGetDocumentAsync = jest.fn().mockResolvedValue({
        assets: [
          {
            name: 'watched-movies.csv',
            size: 1024,
            uri: 'file:///cache/watched-movies.csv',
          },
        ],
        canceled: false,
      });

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));

      const { traktZipImportService, TraktZipImportError } = require('@/src/services/TraktZipImportService');
      traktZipImportService.setDocumentPickerModuleForTest({
        getDocumentAsync: mockGetDocumentAsync,
      } as any);

      await expect(traktZipImportService.pickZipFile()).rejects.toThrow(TraktZipImportError);
    });
  });

  describe('uploadZipFile', () => {
    it('uploads zip archive to Firebase Storage and reports progress', async () => {
      const mockStorage = {};
      const mockRef = jest.fn((_storage, path) => ({ path }));
      let progressCallback: (snapshot: { bytesTransferred: number; totalBytes: number }) => void;
      let completeCallback: () => void;

      const mockUploadBytesResumable = jest.fn((_ref, _blob, _metadata) => ({
        on: (
          event: string,
          onProgress: typeof progressCallback,
          _onError: unknown,
          onComplete: typeof completeCallback
        ) => {
          progressCallback = onProgress;
          completeCallback = onComplete;

          // Simulate progress events
          progressCallback({ bytesTransferred: 50, totalBytes: 100 });
          progressCallback({ bytesTransferred: 100, totalBytes: 100 });
          completeCallback();
        },
      }));

      const mockBlob = { size: 100 };
      const mockFetch = jest.fn().mockResolvedValue({
        blob: jest.fn().mockResolvedValue(mockBlob),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: mockStorage,
      }));
      jest.doMock('firebase/storage', () => ({
        ref: mockRef,
        uploadBytesResumable: mockUploadBytesResumable,
      }));

      const onProgress = jest.fn();
      const { traktZipImportService } = require('@/src/services/TraktZipImportService');

      const storagePath = await traktZipImportService.uploadZipFile(
        'user-123',
        'import-abc',
        'file:///cache/export.zip',
        onProgress
      );

      expect(storagePath).toBe('users/user-123/imports/import-abc.zip');
      expect(mockRef).toHaveBeenCalledWith(mockStorage, 'users/user-123/imports/import-abc.zip');
      expect(onProgress).toHaveBeenCalledWith(0.5);
      expect(onProgress).toHaveBeenCalledWith(1);
    });

    it('throws TraktZipUploadError when Storage upload fails', async () => {
      const mockUploadBytesResumable = jest.fn((_ref, _blob, _metadata) => ({
        on: (
          _event: string,
          _onProgress: unknown,
          onError: (err: Error) => void
        ) => {
          onError(new Error('Storage upload network failure'));
        },
      }));

      const mockFetch = jest.fn().mockResolvedValue({
        blob: jest.fn().mockResolvedValue({ size: 100 }),
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));
      jest.doMock('firebase/storage', () => ({
        ref: jest.fn(),
        uploadBytesResumable: mockUploadBytesResumable,
      }));

      const { traktZipImportService, TraktZipUploadError } = require('@/src/services/TraktZipImportService');

      await expect(
        traktZipImportService.uploadZipFile('user-123', 'import-abc', 'file:///cache/export.zip')
      ).rejects.toThrow(TraktZipUploadError);
    });
  });

  describe('startImport', () => {
    it('invokes startTraktZipImport callable function with importId', async () => {
      const mockCallable = jest.fn().mockResolvedValue({ data: { importId: 'import-abc' } });
      const mockHttpsCallable = jest.fn(() => mockCallable);

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));
      jest.doMock('firebase/functions', () => ({
        httpsCallable: mockHttpsCallable,
      }));

      const { traktZipImportService } = require('@/src/services/TraktZipImportService');
      const result = await traktZipImportService.startImport('import-abc');

      expect(result).toEqual({ importId: 'import-abc' });
      expect(mockCallable).toHaveBeenCalledWith({ importId: 'import-abc' });
    });

    it('throws TraktZipImportError when callable throws', async () => {
      const mockCallable = jest.fn().mockRejectedValue(new Error('User is not premium'));
      const mockHttpsCallable = jest.fn(() => mockCallable);

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));
      jest.doMock('firebase/functions', () => ({
        httpsCallable: mockHttpsCallable,
      }));

      const { traktZipImportService, TraktZipImportError } = require('@/src/services/TraktZipImportService');

      await expect(traktZipImportService.startImport('import-abc')).rejects.toThrow(
        TraktZipImportError
      );
    });
  });

  describe('subscribeToProgress', () => {
    it('subscribes to Firestore progress doc and updates phase and stats', () => {
      const mockDoc = jest.fn((_db, ...pathSegments) => ({ path: pathSegments.join('/') }));
      let snapshotListener: (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => void;
      const mockUnsubscribe = jest.fn();

      const mockOnSnapshot = jest.fn((_ref, onNext) => {
        snapshotListener = onNext;
        return mockUnsubscribe;
      });

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));
      jest.doMock('firebase/firestore', () => ({
        doc: mockDoc,
        onSnapshot: mockOnSnapshot,
      }));

      const { traktZipImportService } = require('@/src/services/TraktZipImportService');
      const onUpdate = jest.fn();
      const onError = jest.fn();

      const unsubscribe = traktZipImportService.subscribeToProgress(
        'user-123',
        'import-abc',
        onUpdate,
        onError
      );

      // Simulate Firestore snapshot update (syncing phase)
      snapshotListener!({
        exists: () => true,
        data: () => ({
          id: 'import-abc',
          progress: { current: 65, phase: 'syncing', total: 100 },
          stats: {
            customLists: 2,
            episodes: 50,
            favorites: 10,
            movies: 100,
            movieWatches: 120,
            ratings: 40,
            shows: 15,
            watchlist: 25,
          },
          status: 'processing',
          userId: 'user-123',
        }),
      });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'import-abc',
          progress: { current: 65, phase: 'syncing', total: 100 },
          stats: {
            customLists: 2,
            episodes: 50,
            favorites: 10,
            movies: 100,
            movieWatches: 120,
            ratings: 40,
            shows: 15,
            watchlist: 25,
          },
          status: 'processing',
          userId: 'user-123',
        })
      );

      // Simulate Firestore snapshot update (completed phase)
      snapshotListener!({
        exists: () => true,
        data: () => ({
          id: 'import-abc',
          progress: { current: 100, phase: 'completed', total: 100 },
          stats: {
            customLists: 2,
            episodes: 50,
            favorites: 10,
            movies: 100,
            movieWatches: 120,
            ratings: 40,
            shows: 15,
            watchlist: 25,
          },
          status: 'completed',
          userId: 'user-123',
        }),
      });

      expect(onUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: { current: 100, phase: 'completed', total: 100 },
          status: 'completed',
        })
      );

      unsubscribe();
      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('handles Firestore subscription error', () => {
      let errorListener: (err: Error) => void;
      const mockOnSnapshot = jest.fn((_ref, _onNext, onError) => {
        errorListener = onError;
        return jest.fn();
      });

      jest.doMock('@/src/firebase/config', () => ({
        db: {},
        functions: {},
        storage: {},
      }));
      jest.doMock('firebase/firestore', () => ({
        doc: jest.fn(),
        onSnapshot: mockOnSnapshot,
      }));

      const { traktZipImportService } = require('@/src/services/TraktZipImportService');
      const onUpdate = jest.fn();
      const onError = jest.fn();

      traktZipImportService.subscribeToProgress('user-123', 'import-abc', onUpdate, onError);

      const testError = new Error('Permission denied on subscription');
      errorListener!(testError);

      expect(onError).toHaveBeenCalledWith(testError);
    });
  });
});
