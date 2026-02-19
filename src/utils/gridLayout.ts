import { SPACING } from '@/src/constants/theme';

const GRID_COLUMN_COUNT = 3;
const GRID_GAP = SPACING.m;
const TARGET_OUTER_PADDING = SPACING.l;

export interface GridMetrics {
  itemWidth: number;
  itemHorizontalMargin: number;
  listPaddingHorizontal: number;
}

export interface ThreeColumnGridMetrics extends GridMetrics {}

export function getGridMetrics(
  windowWidth: number,
  columnCount: number,
  gap: number,
  outerPadding: number
): GridMetrics {
  const safeWindowWidth = Number.isFinite(windowWidth) ? Math.max(0, windowWidth) : 0;
  const safeColumnCount = Number.isFinite(columnCount) ? Math.max(1, Math.floor(columnCount)) : 1;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const safeOuterPadding = Number.isFinite(outerPadding) ? Math.max(0, outerPadding) : 0;
  const itemHorizontalMargin = safeGap / 2;
  const listPaddingHorizontal = Math.max(0, safeOuterPadding - itemHorizontalMargin);
  const nonItemWidth =
    listPaddingHorizontal * 2 + safeColumnCount * itemHorizontalMargin * 2;
  const availableItemWidth = Math.max(0, safeWindowWidth - nonItemWidth);
  const itemWidth = availableItemWidth / safeColumnCount;

  return {
    itemWidth,
    itemHorizontalMargin,
    listPaddingHorizontal,
  };
}

export function getThreeColumnGridMetrics(windowWidth: number): ThreeColumnGridMetrics {
  return getGridMetrics(windowWidth, GRID_COLUMN_COUNT, GRID_GAP, TARGET_OUTER_PADDING);
}
