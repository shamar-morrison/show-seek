import type { ListMediaItem } from '@/src/services/ListService';
import { compareMissingLast, getItemRuntime, getItemUserRating } from '@/src/utils/listSort';

describe('listSort', () => {
  describe('compareMissingLast', () => {
    const sortValues = (values: (number | undefined)[], direction: 1 | -1) =>
      [...values].sort((a, b) => compareMissingLast(a, b, direction));

    it('sorts present values by direction and keeps missing values last', () => {
      expect(sortValues([5, undefined, 9, 1], 1)).toEqual([1, 5, 9, undefined]);
      expect(sortValues([5, undefined, 9, 1], -1)).toEqual([9, 5, 1, undefined]);
    });

    it('treats two missing values as equal', () => {
      expect(compareMissingLast(undefined, undefined, 1)).toBe(0);
    });
  });

  it('prefers a stored runtime, then a runtime found after load', () => {
    const stored = { id: 1, media_type: 'movie', runtimeMinutes: 100 } as ListMediaItem;
    const unstored = { id: 2, media_type: 'tv' } as ListMediaItem;
    const runtimes = new Map([
      ['movie:1', 50],
      ['tv:2', 45],
    ]);

    expect(getItemRuntime(stored, runtimes)).toBe(100);
    expect(getItemRuntime(unstored, runtimes)).toBe(45);
    expect(getItemRuntime(unstored)).toBeUndefined();
  });

  it('looks up the user rating by media type and id', () => {
    const item = { id: 7, media_type: 'tv' } as ListMediaItem;
    expect(getItemUserRating(item, new Map([['tv:7', 8]]))).toBe(8);
    expect(getItemUserRating(item, new Map([['movie:7', 8]]))).toBeUndefined();
  });
});
