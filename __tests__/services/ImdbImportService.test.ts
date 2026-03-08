describe('ImdbImportService', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('can be imported without resolving picker or file-system modules', () => {
    const mockHttpsCallable = jest.fn((_functions: unknown, _name: unknown) => jest.fn());
    const mockDocumentPickerFactory = jest.fn(() => {
      throw new Error('expo-document-picker should not load during service import');
    });
    const mockFileSystemFactory = jest.fn(() => {
      throw new Error('expo-file-system should not load during service import');
    });

    jest.doMock('@/src/firebase/config', () => ({
      functions: {},
    }));
    jest.doMock('firebase/functions', () => ({
      httpsCallable: mockHttpsCallable,
    }));
    jest.doMock('expo-document-picker', mockDocumentPickerFactory);
    jest.doMock('expo-file-system/legacy', mockFileSystemFactory);

    const { imdbImportService } = require('@/src/services/ImdbImportService');

    expect(imdbImportService).toBeDefined();
    expect(mockDocumentPickerFactory).not.toHaveBeenCalled();
    expect(mockFileSystemFactory).not.toHaveBeenCalled();
  });

  it('reads selected files with lazily loaded native modules', async () => {
    const mockGetDocumentAsync = jest.fn().mockResolvedValue({
      assets: [
        {
          lastModified: 1,
          name: 'ratings.csv',
          uri: 'file://cache/ratings.csv',
        },
        {
          lastModified: 2,
          name: '',
          uri: 'file://cache/watchlist.csv',
        },
      ],
      canceled: false,
    });
    const mockReadAsStringAsync = jest
      .fn()
      .mockResolvedValueOnce('ratings-data')
      .mockResolvedValueOnce('watchlist-data');
    const mockHttpsCallable = jest.fn((_functions: unknown, _name: unknown) => jest.fn());

    jest.doMock('@/src/firebase/config', () => ({
      functions: {},
    }));
    jest.doMock('firebase/functions', () => ({
      httpsCallable: mockHttpsCallable,
    }));
    jest.doMock('expo-document-picker', () => ({
      getDocumentAsync: (options: unknown) => mockGetDocumentAsync(options),
    }));
    jest.doMock('expo-file-system/legacy', () => ({
      readAsStringAsync: (uri: unknown) => mockReadAsStringAsync(uri),
    }));

    const { imdbImportService } = require('@/src/services/ImdbImportService');

    await expect(imdbImportService.pickRawFiles()).resolves.toEqual([
      { content: 'ratings-data', fileName: 'ratings.csv' },
      { content: 'watchlist-data', fileName: 'imdb-import.csv' },
    ]);

    expect(mockGetDocumentAsync).toHaveBeenCalledWith({
      base64: false,
      copyToCacheDirectory: true,
      multiple: true,
      type: ['text/csv', 'text/plain'],
    });
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file://cache/ratings.csv');
    expect(mockReadAsStringAsync).toHaveBeenCalledWith('file://cache/watchlist.csv');
  });

  it('returns an empty list when the picker is canceled without loading the file system', async () => {
    const mockGetDocumentAsync = jest.fn().mockResolvedValue({
      assets: null,
      canceled: true,
    });
    const mockHttpsCallable = jest.fn((_functions: unknown, _name: unknown) => jest.fn());
    const mockFileSystemFactory = jest.fn(() => ({
      readAsStringAsync: jest.fn(),
    }));

    jest.doMock('@/src/firebase/config', () => ({
      functions: {},
    }));
    jest.doMock('firebase/functions', () => ({
      httpsCallable: mockHttpsCallable,
    }));
    jest.doMock('expo-document-picker', () => ({
      getDocumentAsync: (options: unknown) => mockGetDocumentAsync(options),
    }));
    jest.doMock('expo-file-system/legacy', mockFileSystemFactory);

    const { imdbImportService } = require('@/src/services/ImdbImportService');

    await expect(imdbImportService.pickRawFiles()).resolves.toEqual([]);

    expect(mockGetDocumentAsync).toHaveBeenCalledTimes(1);
    expect(mockFileSystemFactory).not.toHaveBeenCalled();
  });

  it('rejects when the native picker module cannot be loaded', async () => {
    const mockHttpsCallable = jest.fn((_functions: unknown, _name: unknown) => jest.fn());
    const mockDocumentPickerFactory = jest.fn(() => {
      throw new Error('native picker unavailable');
    });

    jest.doMock('@/src/firebase/config', () => ({
      functions: {},
    }));
    jest.doMock('firebase/functions', () => ({
      httpsCallable: mockHttpsCallable,
    }));
    jest.doMock('expo-document-picker', mockDocumentPickerFactory);
    jest.doMock('expo-file-system/legacy', () => ({
      readAsStringAsync: jest.fn(),
    }));

    const { imdbImportService } = require('@/src/services/ImdbImportService');

    await expect(imdbImportService.pickRawFiles()).rejects.toThrow('native picker unavailable');

    expect(mockDocumentPickerFactory).toHaveBeenCalledTimes(1);
  });
});
