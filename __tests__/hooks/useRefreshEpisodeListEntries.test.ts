import { renderHook, waitFor } from '@testing-library/react-native';

const mockUpdateListItemFields = jest.fn();
const mockSetQueryData = jest.fn();
const mockInvalidateQueries = jest.fn();

jest.mock('@/src/services/ListService', () => ({
  listService: {
    updateListItemFields: (...args: unknown[]) => mockUpdateListItemFields(...args),
  },
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'test-user', isAnonymous: false } }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    setQueryData: mockSetQueryData,
    invalidateQueries: mockInvalidateQueries,
  }),
}));

import { useRefreshEpisodeListEntries } from '@/src/hooks/useRefreshEpisodeListEntries';

const savedEntry = {
  id: 1396,
  media_type: 'episode',
  season_number: 2,
  episode_number: 5,
  episode_name: 'Episode 5',
  release_date: '',
  still_path: null,
};
const episode = { name: 'Breakage', air_date: '2009-04-05', still_path: '/b.jpg', runtime: 47 };
const lists = [
  { id: 'watchlist', items: { 'episode-1396-2-5': savedEntry }, overflowItemPages: {} },
  {
    id: 'big-list',
    items: { 'episode-1396-2-5': savedEntry },
    overflowItemPages: { 'episode-1396-2-5': 3 },
  },
  { id: 'other', items: { 'tv-1396': { id: 1396, media_type: 'tv' } } },
] as any;
const ref = { id: 1396, media_type: 'episode', season_number: 2, episode_number: 5 };
const expectedFields = {
  episode_name: 'Breakage',
  release_date: '2009-04-05',
  first_air_date: '2009-04-05',
  still_path: '/b.jpg',
  runtimeMinutes: 47,
  episodeRuntimeMinutes: 47,
};

describe('useRefreshEpisodeListEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateListItemFields.mockResolvedValue(true);
  });

  it('updates each outdated entry in the document that holds it, once', async () => {
    const { rerender } = renderHook(
      (props: { lists: any }) =>
        useRefreshEpisodeListEntries({
          tvId: 1396,
          seasonNumber: 2,
          episodeNumber: 5,
          episode,
          lists: props.lists,
        }),
      { initialProps: { lists } }
    );

    await waitFor(() => expect(mockSetQueryData).toHaveBeenCalled());
    expect(mockUpdateListItemFields).toHaveBeenCalledTimes(2);
    expect(mockUpdateListItemFields).toHaveBeenCalledWith('watchlist', ref, 0, expectedFields);
    expect(mockUpdateListItemFields).toHaveBeenCalledWith('big-list', ref, 3, expectedFields);

    // The cached lists get the new fields, so nothing is read again.
    const updater = mockSetQueryData.mock.calls[0][1];
    const updated = updater(lists);
    expect(updated[0].items['episode-1396-2-5']).toEqual({ ...savedEntry, ...expectedFields });
    expect(updated[2]).toBe(lists[2]);

    rerender({ lists: [...lists] });
    expect(mockUpdateListItemFields).toHaveBeenCalledTimes(2);
  });

  it('reloads the lists, and patches nothing, when an entry was removed meanwhile', async () => {
    mockUpdateListItemFields.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    renderHook(() =>
      useRefreshEpisodeListEntries({
        tvId: 1396,
        seasonNumber: 2,
        episodeNumber: 5,
        episode,
        lists,
      })
    );

    await waitFor(() =>
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['lists', 'test-user'] })
    );
    // Only the list that still holds the entry is patched in the cache.
    const updater = mockSetQueryData.mock.calls[0][1];
    const updated = updater(lists);
    expect(updated[0]).toBe(lists[0]);
    expect(updated[1].items['episode-1396-2-5']).toEqual({ ...savedEntry, ...expectedFields });
  });

  it('writes nothing when no saved entry is out of date', () => {
    renderHook(() =>
      useRefreshEpisodeListEntries({
        tvId: 1396,
        seasonNumber: 2,
        episodeNumber: 5,
        episode,
        lists: [{ id: 'watchlist', items: { 'tv-1396': { id: 1396, media_type: 'tv' } } }] as any,
      })
    );

    expect(mockUpdateListItemFields).not.toHaveBeenCalled();
  });

  it('waits for the episode and the lists', () => {
    renderHook(() =>
      useRefreshEpisodeListEntries({
        tvId: 1396,
        seasonNumber: 2,
        episodeNumber: 5,
        episode: undefined,
        lists,
      })
    );

    expect(mockUpdateListItemFields).not.toHaveBeenCalled();
  });
});
