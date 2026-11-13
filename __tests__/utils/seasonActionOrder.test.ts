import {
  DEFAULT_SEASON_ACTION_ORDER,
  isDefaultSeasonActionOrder,
  resolveSeasonActionOrder,
} from '@/src/utils/seasonActionOrder';

describe('resolveSeasonActionOrder', () => {
  it("uses the seasons' original order when nothing is saved", () => {
    expect(resolveSeasonActionOrder(undefined)).toEqual([
      'markAll',
      'rating',
      'note',
      'list',
      'shareCard',
    ]);
    expect(resolveSeasonActionOrder('list')).toEqual([...DEFAULT_SEASON_ACTION_ORDER]);
  });

  it('keeps a saved order', () => {
    const saved = ['list', 'shareCard', 'note', 'rating', 'markAll'];
    expect(resolveSeasonActionOrder(saved)).toEqual(saved);
  });

  it('drops unknown and repeated ids, including movie-page buttons seasons do not have', () => {
    expect(resolveSeasonActionOrder(['note', 'reminder', 'note', 3, 'list'])).toEqual([
      'note',
      'list',
      'markAll',
      'rating',
      'shareCard',
    ]);
  });

  it('adds buttons a saved order does not mention at the end, in default order', () => {
    expect(resolveSeasonActionOrder(['shareCard'])).toEqual([
      'shareCard',
      'markAll',
      'rating',
      'note',
      'list',
    ]);
  });
});

describe('isDefaultSeasonActionOrder', () => {
  it('is true only for the default order', () => {
    expect(isDefaultSeasonActionOrder([...DEFAULT_SEASON_ACTION_ORDER])).toBe(true);
    expect(isDefaultSeasonActionOrder(['rating', 'markAll', 'note', 'list', 'shareCard'])).toBe(
      false
    );
  });
});
