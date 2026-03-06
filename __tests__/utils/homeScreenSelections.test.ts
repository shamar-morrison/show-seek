import { DEFAULT_HOME_LISTS } from '@/src/constants/homeScreenLists';
import { HomeScreenListItem } from '@/src/types/preferences';
import { normalizeHomeScreenSelections } from '@/src/utils/homeScreenSelections';

describe('normalizeHomeScreenSelections', () => {
  it('removes stale deleted custom lists', () => {
    const selections: HomeScreenListItem[] = [
      { id: 'deleted-list', type: 'custom', label: 'Deleted List' },
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
    ];

    expect(normalizeHomeScreenSelections(selections, [])).toEqual([
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
    ]);
  });

  it('deduplicates by id while preserving first-seen order', () => {
    const selections: HomeScreenListItem[] = [
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
      { id: 'watchlist', type: 'default', label: 'Duplicate Watchlist' },
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
    ];

    expect(normalizeHomeScreenSelections(selections, [])).toEqual([
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
      { id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' },
    ]);
  });

  it('refreshes custom labels from the current custom list catalog', () => {
    const selections: HomeScreenListItem[] = [
      { id: 'my-list', type: 'custom', label: 'Old Name' },
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
    ];

    expect(normalizeHomeScreenSelections(selections, [{ id: 'my-list', name: 'New Name' }])).toEqual([
      { id: 'my-list', type: 'custom', label: 'New Name' },
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
    ]);
  });

  it('falls back to defaults when all selections are invalid', () => {
    const selections: HomeScreenListItem[] = [
      { id: 'missing-custom', type: 'custom', label: 'Missing Custom' },
    ];

    expect(normalizeHomeScreenSelections(selections, [])).toEqual(DEFAULT_HOME_LISTS);
  });
});
