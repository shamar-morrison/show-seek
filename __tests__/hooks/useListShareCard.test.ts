import { useListShareCard } from '@/src/hooks/useListShareCard';
import type { ListMediaItem } from '@/src/services/ListService';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@hugeicons/core-free-icons', () => ({ Image01Icon: 'image-icon' }));
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

describe('useListShareCard', () => {
  it('stays closed until the action is pressed', () => {
    const { result } = renderHook(() => useListShareCard('My List', [item(1, '/a.jpg')]));
    expect(result.current.shareCard).toBeNull();

    act(() => result.current.shareCardAction.onPress());

    expect(result.current.shareCard).toEqual({
      kind: 'list',
      listName: 'My List',
      itemCount: 1,
      posterPaths: ['/a.jpg'],
    });

    act(() => result.current.closeShareCard());
    expect(result.current.shareCard).toBeNull();
  });

  it('is disabled for an empty list', () => {
    const { result } = renderHook(() => useListShareCard('My List', []));

    expect(result.current.shareCardAction.disabled).toBe(true);
  });

  it('uses the first three available posters in order, but counts every item', () => {
    const items = [
      item(1, '/a.jpg'),
      item(2, null),
      item(3, '/b.jpg'),
      item(4, '/c.jpg'),
      item(5, '/d.jpg'),
    ];
    const { result } = renderHook(() => useListShareCard('My List', items));

    act(() => result.current.shareCardAction.onPress());

    expect(result.current.shareCard?.posterPaths).toEqual(['/a.jpg', '/b.jpg', '/c.jpg']);
    expect(result.current.shareCard?.itemCount).toBe(5);
  });

  it('respects custom posters', () => {
    const { result } = renderHook(() => useListShareCard('My List', [item(99, '/original.jpg')]));

    act(() => result.current.shareCardAction.onPress());

    expect(result.current.shareCard?.posterPaths).toEqual(['/custom.jpg']);
  });
});
