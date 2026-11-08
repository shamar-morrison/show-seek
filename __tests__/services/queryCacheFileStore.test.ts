import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFiles = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFiles.has(uri) })),
  readAsStringAsync: jest.fn(async (uri: string) => mockFiles.get(uri)),
  writeAsStringAsync: jest.fn(async (uri: string, text: string) => {
    mockFiles.set(uri, text);
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFiles.delete(uri);
  }),
  moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
    mockFiles.set(to, mockFiles.get(from)!);
    mockFiles.delete(from);
  }),
}));

import { fileQueryCacheStore } from '@/src/services/queryCachePersistence';

const FILE = 'file:///docs/showseek_query_cache_v1.json';
const LEGACY_KEY = 'showseek_query_cache_v1';

describe('file-backed query cache store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFiles.clear();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
  });

  it('writes through a temp file and reads it back', async () => {
    const big = 'x'.repeat(5 * 1024 * 1024); // over Android's ~2 MB AsyncStorage row limit

    await fileQueryCacheStore.write(big);

    expect(mockFiles.get(FILE)).toBe(big);
    expect(mockFiles.has(`${FILE}.tmp`)).toBe(false);
    await expect(fileQueryCacheStore.read()).resolves.toBe(big);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('migrates the old AsyncStorage copy into the file, then removes it', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"legacy":true}');

    await expect(fileQueryCacheStore.read()).resolves.toBe('{"legacy":true}');

    expect(mockFiles.get(FILE)).toBe('{"legacy":true}');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('keeps the old copy when it cannot be written to the file yet, and migrates it later', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const fs = jest.requireMock('expo-file-system/legacy');
    (fs.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    let legacy: string | null = '{"legacy":true}';
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === LEGACY_KEY ? legacy : null
    );
    (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === LEGACY_KEY) legacy = null;
    });

    await expect(fileQueryCacheStore.read()).resolves.toBe('{"legacy":true}');
    expect(legacy).toBe('{"legacy":true}');

    // The next launch migrates it.
    await expect(fileQueryCacheStore.read()).resolves.toBe('{"legacy":true}');
    expect(mockFiles.get(FILE)).toBe('{"legacy":true}');
    expect(legacy).toBeNull();
    warn.mockRestore();
  });

  it('ignores a truncated temp file and falls back to the old copy', async () => {
    mockFiles.set(`${FILE}.tmp`, '{"cut off');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('{"legacy":true}');

    await expect(fileQueryCacheStore.read()).resolves.toBe('{"legacy":true}');
    expect(mockFiles.get(FILE)).toBe('{"legacy":true}');
  });

  it('recovers a complete temp file left by an interrupted swap', async () => {
    mockFiles.set(`${FILE}.tmp`, '{"swapped":true}');

    await expect(fileQueryCacheStore.read()).resolves.toBe('{"swapped":true}');
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('discards an old copy too large for Android to read', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (AsyncStorage.getItem as jest.Mock).mockRejectedValue(
      new Error('Row too big to fit into CursorWindow')
    );

    await expect(fileQueryCacheStore.read()).resolves.toBeNull();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
    warn.mockRestore();
  });

  it('does not touch AsyncStorage once the file exists', async () => {
    mockFiles.set(FILE, '{"file":true}');

    await expect(fileQueryCacheStore.read()).resolves.toBe('{"file":true}');

    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  });

  it('clears both the file and any old AsyncStorage copy', async () => {
    mockFiles.set(FILE, '{}');

    await fileQueryCacheStore.clear();

    expect(mockFiles.has(FILE)).toBe(false);
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
  });

  it('still removes the old copy when deleting the file fails', async () => {
    const fs = jest.requireMock('expo-file-system/legacy');
    (fs.deleteAsync as jest.Mock).mockRejectedValueOnce(new Error('busy'));

    await expect(fileQueryCacheStore.clear()).rejects.toThrow('busy');
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith(LEGACY_KEY);
  });
});
