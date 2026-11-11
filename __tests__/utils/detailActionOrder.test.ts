import {
  DEFAULT_DETAIL_ACTION_ORDER,
  isDefaultDetailActionOrder,
  resolveDetailActionOrder,
} from '@/src/utils/detailActionOrder';

describe('resolveDetailActionOrder', () => {
  it('uses the default order when nothing is saved', () => {
    expect(resolveDetailActionOrder(undefined)).toEqual([...DEFAULT_DETAIL_ACTION_ORDER]);
    expect(resolveDetailActionOrder('rating')).toEqual([...DEFAULT_DETAIL_ACTION_ORDER]);
  });

  it('keeps a saved order', () => {
    const saved = ['note', 'shareCard', 'list', 'reminder', 'rating'];
    expect(resolveDetailActionOrder(saved)).toEqual(saved);
  });

  it('drops unknown and repeated ids', () => {
    expect(resolveDetailActionOrder(['rating', 'checkIn', 'rating', 7, 'list'])).toEqual([
      'rating',
      'list',
      'reminder',
      'note',
      'shareCard',
    ]);
  });

  it('adds buttons a saved order does not mention at the end, in default order', () => {
    expect(resolveDetailActionOrder(['shareCard', 'note'])).toEqual([
      'shareCard',
      'note',
      'list',
      'rating',
      'reminder',
    ]);
  });
});

describe('isDefaultDetailActionOrder', () => {
  it('tells the default order apart from a custom one', () => {
    expect(isDefaultDetailActionOrder([...DEFAULT_DETAIL_ACTION_ORDER])).toBe(true);
    expect(isDefaultDetailActionOrder(['rating', 'list', 'reminder', 'note', 'shareCard'])).toBe(
      false
    );
  });
});
