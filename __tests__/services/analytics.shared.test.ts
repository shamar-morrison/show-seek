import { getAnalyticsScreenName } from '@/src/services/analytics.shared';

describe('getAnalyticsScreenName', () => {
  it('keeps the root index route visible', () => {
    expect(getAnalyticsScreenName(['index'])).toBe('index');
  });

  it('keeps grouped root index routes visible', () => {
    expect(getAnalyticsScreenName(['(tabs)', 'index'])).toBe('index');
  });

  it('drops trailing index segments from nested routes', () => {
    expect(getAnalyticsScreenName(['(tabs)', 'home', 'index'])).toBe('home');
  });

  it('drops route groups from non-index routes', () => {
    expect(getAnalyticsScreenName(['(auth)', 'sign-in'])).toBe('sign-in');
  });
});
