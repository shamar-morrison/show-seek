import { filterPresetService, mapDocToFilterPreset } from '@/src/services/FilterPresetService';
import { DEFAULT_DISCOVER_FILTERS } from '@/src/utils/discoverFilters';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { deleteDoc, doc, getDocs, setDoc, Timestamp, updateDoc } from 'firebase/firestore';

let mockCurrentUser: { uid: string; isAnonymous: boolean } | null = {
  uid: 'user-1',
  isAnonymous: false,
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

const created = new Date(2026, 3, 1);
const used = new Date(2026, 4, 1);

describe('mapDocToFilterPreset', () => {
  it('maps a Discover preset and fills missing filters from the defaults', () => {
    expect(
      mapDocToFilterPreset('d1', {
        scope: 'discover',
        name: 'Horror',
        mediaType: 'tv',
        filters: { genres: [27] },
        createdAt: { toDate: () => created },
      })
    ).toEqual({
      id: 'd1',
      scope: 'discover',
      name: 'Horror',
      mediaType: 'tv',
      filters: { ...DEFAULT_DISCOVER_FILTERS, genres: [27] },
      createdAt: created,
      lastUsedAt: null,
    });
  });

  it('maps a list preset', () => {
    expect(
      mapDocToFilterPreset('l1', {
        scope: 'list',
        name: 'Rated',
        filters: { userRating: 'rated' },
        createdAt: { toDate: () => created },
        lastUsedAt: { toDate: () => used },
      })
    ).toEqual({
      id: 'l1',
      scope: 'list',
      name: 'Rated',
      filters: { ...DEFAULT_WATCH_STATUS_FILTERS, userRating: 'rated' },
      createdAt: created,
      lastUsedAt: used,
    });
  });

  it('skips documents that are not usable presets', () => {
    expect(mapDocToFilterPreset('x', { scope: 'other', name: 'x', filters: {} })).toBeNull();
    expect(mapDocToFilterPreset('x', { scope: 'list', name: '', filters: {} })).toBeNull();
    expect(
      mapDocToFilterPreset('x', { scope: 'discover', name: 'x', mediaType: 'book', filters: {} })
    ).toBeNull();
  });
});

describe('FilterPresetService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = { uid: 'user-1', isAnonymous: false };
    (doc as jest.Mock).mockImplementation((_parent: unknown, id?: string) => ({
      id: id ?? 'auto',
    }));
  });

  it('reads presets from the user subcollection and drops unusable ones', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      size: 2,
      docs: [
        {
          id: 'l1',
          data: () => ({ scope: 'list', name: 'A', filters: {}, createdAt: Timestamp.now() }),
        },
        { id: 'bad', data: () => ({ scope: 'nope' }) },
      ],
    });

    const presets = await filterPresetService.getUserPresets('user-1');
    expect(presets.map((p) => p.id)).toEqual(['l1']);
  });

  it('returns nothing for another user', async () => {
    expect(await filterPresetService.getUserPresets('someone-else')).toEqual([]);
    expect(getDocs).not.toHaveBeenCalled();
  });

  it('saves a Discover preset with its tab, and a list preset without one', async () => {
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    await filterPresetService.savePreset('user-1', {
      id: 'd1',
      scope: 'discover',
      name: 'Horror',
      mediaType: 'movie',
      filters: DEFAULT_DISCOVER_FILTERS,
      createdAt: created,
    });
    expect(setDoc).toHaveBeenLastCalledWith(
      { id: 'd1' },
      expect.objectContaining({ scope: 'discover', name: 'Horror', mediaType: 'movie' })
    );

    await filterPresetService.savePreset('user-1', {
      id: 'l1',
      scope: 'list',
      name: 'Rated',
      filters: DEFAULT_WATCH_STATUS_FILTERS,
      createdAt: created,
    });
    const listDoc = (setDoc as jest.Mock).mock.calls.at(-1)[1];
    expect(listDoc).not.toHaveProperty('mediaType');
    expect(listDoc.scope).toBe('list');
  });

  it('updates filters and the Discover tab together', async () => {
    (updateDoc as jest.Mock).mockResolvedValue(undefined);
    await filterPresetService.updatePresetFilters('user-1', {
      id: 'd1',
      scope: 'discover',
      name: 'Horror',
      mediaType: 'tv',
      filters: DEFAULT_DISCOVER_FILTERS,
      createdAt: created,
    });
    expect(updateDoc).toHaveBeenCalledWith(
      { id: 'd1' },
      expect.objectContaining({ mediaType: 'tv', filters: DEFAULT_DISCOVER_FILTERS })
    );
  });

  it('records when a preset was last applied', async () => {
    (updateDoc as jest.Mock).mockResolvedValue(undefined);
    await filterPresetService.markPresetUsed('user-1', 'l1');
    expect(updateDoc).toHaveBeenCalledWith({ id: 'l1' }, { lastUsedAt: expect.anything() });
  });

  it('refuses writes for another user', async () => {
    await expect(filterPresetService.deletePreset('someone-else', 'l1')).rejects.toThrow();
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});
