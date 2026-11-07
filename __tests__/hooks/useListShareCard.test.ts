import { useListShareCardAction } from '@/src/hooks/useListShareCard';
import type { ListMediaItem } from '@/src/services/ListService';
import { renderHook } from '@testing-library/react-native';

const mockOpenShareCard = jest.fn();

jest.mock('@hugeicons/core-free-icons', () => ({ Image01Icon: 'image-icon' }));
jest.mock('@/src/hooks/useOpenShareCard', () => ({
  useOpenShareCard: () => mockOpenShareCard,
}));
jest.mock('@/src/hooks/usePosterOverrides', () => ({
  usePosterOverrides: () => ({
    resolvePosterPath: (_type: string, id: number, path: string | null) =>
      id === 99 ? '/custom.jpg' : path,
  }),
}));

const item = (id: number, poster_path: string | null): ListMediaItem => ({
  id,
  title: `Item ${id}`,
  poster_path,
  media_type: 'movie',
  vote_average: 7,
  release_date: '2020-01-01',
  addedAt: id,
});

const pressAction = (items: ListMediaItem[]) => {
  const { result } = renderHook(() => useListShareCardAction('My List', items));
  result.current.onPress();
  return mockOpenShareCard.mock.lastCall![0][0];
};

describe('useListShareCardAction', () => {
  it('opens the list card when pressed', () => {
    expect(pressAction([item(1, '/a.jpg')])).toEqual({
      kind: 'list',
      listName: 'My List',
      itemCount: 1,
      posterPaths: ['/a.jpg'],
    });
  });

  it('is disabled for an empty list', () => {
    const { result } = renderHook(() => useListShareCardAction('My List', []));

    expect(result.current.disabled).toBe(true);
  });

  it('uses the first three available posters in order, but counts every item', () => {
    const card = pressAction([
      item(1, '/a.jpg'),
      item(2, null),
      item(3, '/b.jpg'),
      item(4, '/c.jpg'),
      item(5, '/d.jpg'),
    ]);

    expect(card.posterPaths).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    expect(card.itemCount).toBe(5);
  });

  it('skips repeated posters, so the fan still shows three different ones', () => {
    const card = pressAction([
      item(1, '/a.jpg'),
      item(2, '/a.jpg'),
      item(3, '/b.jpg'),
      item(4, '/c.jpg'),
    ]);

    expect(card.posterPaths).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
  });

  it('respects custom posters', () => {
    expect(pressAction([item(99, '/original.jpg')]).posterPaths).toEqual(['/custom.jpg']);
  });
});
