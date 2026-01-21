export const COLORS = {
  primary: '#E50914', // Netflix Red
  secondary: '#564d4d',
  background: '#000000',
  surface: '#121212',
  surfaceLight: '#232323',
  text: '#FFFFFF',
  textSecondary: '#B3B3B3',
  success: '#46D369',
  warning: '#F57C00',
  error: '#E50914',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
  overlay: 'rgba(0,0,0,0.5)',
} as const;

export const SPACING = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
} as const;

export const BORDER_RADIUS = {
  s: 4,
  m: 8,
  l: 12,
  xl: 16,
  round: 9999,
} as const;

export const FONT_SIZE = {
  xs: 12,
  s: 14,
  m: 16,
  l: 20,
  xl: 24,
  xxl: 32,
  hero: 40,
} as const;

export const ACTIVE_OPACITY = 0.9; // the higher the value, the less opacity

export const HIT_SLOP = {
  s: 12, // for medium icons (~32px)
  m: 16, // for smaller icons (~24px)
  l: 20, // for tiny icons (~16-20px)
} as const;

export const BUTTON_HEIGHT = 48;

/** Combined height of header + navigation chrome to subtract from empty state container */
export const HEADER_CHROME_HEIGHT = 150;

/**
 * Helper to add alpha transparency to a hex color
 * @param hex Hex color string (e.g., #E50914)
 * @param alpha Alpha value between 0 and 1
 * @returns rgba color string
 */
export const hexToRGBA = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
