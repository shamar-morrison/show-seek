import { dedupeMediaById } from '@/src/utils/mediaUtils';

describe('dedupeMediaById', () => {
  it('keeps first occurrence order', () => {
    const items = [
      { id: 10, title: 'A' },
      { id: 20, title: 'B' },
      { id: 10, title: 'A duplicate' },
      { id: 30, title: 'C' },
    ];

    const result = dedupeMediaById(items);

    expect(result).toEqual([
      { id: 10, title: 'A' },
      { id: 20, title: 'B' },
      { id: 30, title: 'C' },
    ]);
  });

  it('removes repeated ids', () => {
    const items = [{ id: 1 }, { id: 1 }, { id: 1 }, { id: 2 }];

    const result = dedupeMediaById(items);

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.id)).toEqual([1, 2]);
  });

  it('handles empty input', () => {
    expect(dedupeMediaById([])).toEqual([]);
  });
});
