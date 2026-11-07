import AsyncStorage from '@react-native-async-storage/async-storage';
import { createPersistentCache } from '@/src/utils/persistentCache';

const STORAGE_KEY = 'test_persistent_cache';

const isNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'number');

const createCache = (maxEntries = 100) =>
  createPersistentCache<number[]>({
    storageKey: STORAGE_KEY,
    version: 1,
    maxEntries,
    isValidValue: isNumberArray,
  });

describe('createPersistentCache', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips entries through storage', async () => {
    const cache = createCache();
    await cache.load();
    cache.set('a', [1, 2], 1_700_000_000_000);
    await cache.flush();

    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!)).toEqual({
      v: 1,
      e: { a: [1_700_000_000, [1, 2]] },
    });

    const reloaded = createCache();
    expect(reloaded.isLoaded()).toBe(false);
    await reloaded.load();
    expect(reloaded.isLoaded()).toBe(true);
    expect(reloaded.get('a')).toEqual({ value: [1, 2], fetchedAt: 1_700_000_000_000 });
  });

  it('still reads disk after an early set, keeping the newer in-memory value', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, e: { a: [1, [1]], b: [1, [2]] } })
    );

    const cache = createCache();
    cache.set('a', [99], 5_000);
    expect(cache.isLoaded()).toBe(false);
    await cache.load();

    expect(cache.get('a')?.value).toEqual([99]);
    expect(cache.get('b')?.value).toEqual([2]);
  });

  it('drops invalid entries and ignores other versions or corrupt data', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, e: { good: [1, [1]], bad: [1, 'nope'], short: [1] } })
    );
    const cache = createCache();
    await cache.load();
    expect(cache.get('good')).toBeDefined();
    expect(cache.get('bad')).toBeUndefined();
    expect(cache.get('short')).toBeUndefined();

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 2, e: { good: [1, [1]] } }));
    const otherVersion = createCache();
    await otherVersion.load();
    expect(otherVersion.get('good')).toBeUndefined();

    await AsyncStorage.setItem(STORAGE_KEY, '{not json');
    const corrupt = createCache();
    await corrupt.load();
    expect(corrupt.isLoaded()).toBe(true);
    expect(corrupt.get('good')).toBeUndefined();
  });

  it('evicts the least recently updated entries beyond the cap', async () => {
    const cache = createCache(3);
    await cache.load();
    cache.set('a', [1]);
    cache.set('b', [2]);
    cache.set('c', [3]);
    cache.set('a', [10]); // refresh a, so b is now the oldest
    cache.set('d', [4]);

    expect(cache.get('a')?.value).toEqual([10]);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('c')).toBeDefined();
    expect(cache.get('d')).toBeDefined();
  });
});
