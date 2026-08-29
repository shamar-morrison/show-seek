import {
  clearWinbackStorageCacheForTesting,
  getWinbackStorageKey,
  markHasSeenPaywallWinback,
  readHasSeenPaywallWinback,
} from '@/src/utils/winbackStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDoc, setDoc } from 'firebase/firestore';

const mockGetDoc = getDoc as jest.Mock;
const mockSetDoc = setDoc as jest.Mock;

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db, collection, id) => ({ collection, id })),
  getDoc: jest.fn(),
  setDoc: jest.fn().mockResolvedValue(undefined),
  serverTimestamp: jest.fn(() => 'MOCK_SERVER_TIMESTAMP'),
}));

jest.mock('@/src/firebase/config', () => ({
  db: {},
}));

describe('winbackStorage', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    clearWinbackStorageCacheForTesting();
    await AsyncStorage.clear();
  });

  describe('readHasSeenPaywallWinback', () => {
    it('returns false when userId is not provided', async () => {
      expect(await readHasSeenPaywallWinback(null)).toBe(false);
      expect(await readHasSeenPaywallWinback(undefined)).toBe(false);
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('returns true from Tier 1 in-memory session cache without querying AsyncStorage or Firestore', async () => {
      await markHasSeenPaywallWinback('user-1');
      expect(mockSetDoc).toHaveBeenCalled();

      // Clear AsyncStorage mock to prove it reads from in-memory cache
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');
      mockGetDoc.mockClear();

      const result = await readHasSeenPaywallWinback('user-1');
      expect(result).toBe(true);
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(mockGetDoc).not.toHaveBeenCalled();
    });

    it('returns true from Tier 2 AsyncStorage cache and caches in memory', async () => {
      await AsyncStorage.setItem(getWinbackStorageKey('user-2'), 'true');
      const getItemSpy = jest.spyOn(AsyncStorage, 'getItem');

      const result = await readHasSeenPaywallWinback('user-2');
      expect(result).toBe(true);
      expect(mockGetDoc).not.toHaveBeenCalled();

      // Subsequent read should hit in-memory cache without calling AsyncStorage.getItem again
      getItemSpy.mockClear();
      const secondResult = await readHasSeenPaywallWinback('user-2');
      expect(secondResult).toBe(true);
      expect(getItemSpy).not.toHaveBeenCalled();
    });

    it('falls back to Tier 3 Firestore reconciliation when memory and AsyncStorage miss', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ hasSeenPaywallWinback: true }),
      });

      const result = await readHasSeenPaywallWinback('user-3');
      expect(result).toBe(true);
      expect(mockGetDoc).toHaveBeenCalledWith({ collection: 'users', id: 'user-3' });

      // Verifies it wrote to AsyncStorage
      const asyncVal = await AsyncStorage.getItem(getWinbackStorageKey('user-3'));
      expect(asyncVal).toBe('true');
    });

    it('returns false when Firestore user doc exists but hasSeenPaywallWinback is false/missing', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({}),
      });

      const result = await readHasSeenPaywallWinback('user-4');
      expect(result).toBe(false);
    });

    it('returns false gracefully when Firestore read throws an error', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('Network offline'));

      const result = await readHasSeenPaywallWinback('user-5');
      expect(result).toBe(false);
    });
  });

  describe('markHasSeenPaywallWinback', () => {
    it('sets in-memory cache, writes to AsyncStorage, and triggers fire-and-forget Firestore merge', async () => {
      await markHasSeenPaywallWinback('user-mark');

      const asyncVal = await AsyncStorage.getItem(getWinbackStorageKey('user-mark'));
      expect(asyncVal).toBe('true');

      expect(mockSetDoc).toHaveBeenCalledWith(
        { collection: 'users', id: 'user-mark' },
        {
          hasSeenPaywallWinback: true,
          paywallWinbackSeenAt: 'MOCK_SERVER_TIMESTAMP',
        },
        { merge: true }
      );
    });

    it('handles fire-and-forget Firestore rejections without throwing', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore permission denied'));

      await expect(markHasSeenPaywallWinback('user-err')).resolves.not.toThrow();

      const cached = await readHasSeenPaywallWinback('user-err');
      expect(cached).toBe(true);
    });
  });
});
