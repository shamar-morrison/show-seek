import { SPACING } from '@/src/constants/theme';

const GRID_COLUMN_COUNT = 3;
const GRID_GAP = SPACING.m;
const TARGET_OUTER_PADDING = SPACING.l;

export interface ThreeColumnGridMetrics {
  itemWidth: number;
  itemHorizontalMargin: number;
  listPaddingHorizontal: number;
}

export function getThreeColumnGridMetrics(windowWidth: number): ThreeColumnGridMetrics {
  const safeWindowWidth = Number.isFinite(windowWidth) ? Math.max(0, windowWidth) : 0;
  const itemHorizontalMargin = Math.max(0, GRID_GAP / 2);
  const listPaddingHorizontal = Math.max(0, TARGET_OUTER_PADDING - itemHorizontalMargin);
  const nonItemWidth =
    listPaddingHorizontal * 2 + GRID_COLUMN_COUNT * itemHorizontalMargin * 2;
  const availableItemWidth = Math.max(0, safeWindowWidth - nonItemWidth);
  const itemWidth = availableItemWidth / GRID_COLUMN_COUNT;

  return {
    itemWidth,
    itemHorizontalMargin,
    listPaddingHorizontal,
  };
}
