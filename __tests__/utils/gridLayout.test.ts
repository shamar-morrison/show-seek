import { getThreeColumnGridMetrics } from '@/src/utils/gridLayout';

describe('gridLayout', () => {
  it('returns a non-negative item width for a standard phone width', () => {
    const metrics = getThreeColumnGridMetrics(393);

    expect(metrics.itemWidth).toBeGreaterThanOrEqual(0);
  });

  it('does not overflow the row width', () => {
    const windowWidth = 393;
    const metrics = getThreeColumnGridMetrics(windowWidth);
    const rowWidth =
      metrics.listPaddingHorizontal * 2 +
      metrics.itemWidth * 3 +
      metrics.itemHorizontalMargin * 2 * 3;

    expect(rowWidth).toBeLessThanOrEqual(windowWidth);
  });

  it('clamps safely for very small widths', () => {
    const metrics = getThreeColumnGridMetrics(8);

    expect(metrics.itemWidth).toBe(0);
    expect(metrics.itemHorizontalMargin).toBeGreaterThanOrEqual(0);
    expect(metrics.listPaddingHorizontal).toBeGreaterThanOrEqual(0);
  });
});
