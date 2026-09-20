import { Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * Shared modal layout constants for TrueSheet modals
 * Used to ensure consistent sizing across different screen sizes
 */
export const SHEET_HEIGHT = SCREEN_HEIGHT * 0.8;
export const MODAL_LIST_HEIGHT = SHEET_HEIGHT * 0.5;
/** Taller list cap for modals with many selectable rows (e.g. filter sources). */
export const MODAL_LIST_HEIGHT_LG = SHEET_HEIGHT * 0.65;
