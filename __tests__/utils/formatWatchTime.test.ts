import { formatWatchHours } from '@/src/utils/formatWatchTime';

describe('formatWatchHours', () => {
  it('formats 0 minutes as "0hrs 0mins"', () => {
    expect(formatWatchHours(0)).toBe('0hrs 0mins');
  });

  it('formats exact hour boundaries', () => {
    expect(formatWatchHours(60)).toBe('1hr 0mins');
    expect(formatWatchHours(120)).toBe('2hrs 0mins');
    expect(formatWatchHours(6000)).toBe('100hrs 0mins');
  });

  it('does not pad minutes', () => {
    expect(formatWatchHours(5)).toBe('0hrs 5mins');
    expect(formatWatchHours(61)).toBe('1hr 1min');
    expect(formatWatchHours(90)).toBe('1hr 30mins');
  });

  it('formats totals above 99 hours without truncation', () => {
    expect(formatWatchHours(5999)).toBe('99hrs 59mins');
    expect(formatWatchHours(20535)).toBe('342hrs 15mins');
    expect(formatWatchHours(57727)).toBe('962hrs 7mins');
  });

  it('uses singular units only for exactly 1', () => {
    expect(formatWatchHours(1)).toBe('0hrs 1min');
    expect(formatWatchHours(61)).toBe('1hr 1min');
  });

  it('floors fractional minutes', () => {
    expect(formatWatchHours(90.9)).toBe('1hr 30mins');
  });

  it('treats negative, NaN, and non-finite inputs as 0', () => {
    expect(formatWatchHours(-45)).toBe('0hrs 0mins');
    expect(formatWatchHours(NaN)).toBe('0hrs 0mins');
    expect(formatWatchHours(Infinity)).toBe('0hrs 0mins');
  });
});
