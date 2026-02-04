export const DEFAULT_ACCENT_COLOR = '#E50914';

export const ACCENT_COLORS = [
  { name: 'Amber', value: '#F59E0B' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Emerald', value: '#10B981' },
  { name: 'Fuchsia', value: '#D946EF' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Indigo', value: '#6366F1' },
  { name: 'Lime', value: '#84CC16' },
  { name: 'Orange', value: '#F97316' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Purple', value: '#A855F7' },
  { name: 'Red', value: '#E50914' },
  { name: 'Rose', value: '#F43F5E' },
  { name: 'Sky', value: '#0EA5E9' },
  { name: 'Teal', value: '#14B8A6' },
  { name: 'Violet', value: '#8B5CF6' },
  { name: 'Yellow', value: '#EAB308' },
] as const;

export type AccentColorOption = (typeof ACCENT_COLORS)[number];

export const getAccentColorName = (value: string) =>
  ACCENT_COLORS.find((color) => color.value === value)?.name ?? 'Red';

export const isAccentColor = (value: string) =>
  ACCENT_COLORS.some((color) => color.value === value);
