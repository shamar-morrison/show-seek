import { COLORS } from '@/src/constants/theme';

export const BASE_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: COLORS.background },
  headerTintColor: COLORS.text,
  headerTitleStyle: { fontWeight: 'bold' },
  contentStyle: { backgroundColor: COLORS.background },
  headerBackTitle: '',
} as const;

export const TAB_STACK_SCREEN_OPTIONS = {
  ...BASE_STACK_SCREEN_OPTIONS,
  freezeOnBlur: true,
  // Hide header by default to prevent flash of route path on dynamic screens
  headerShown: false,
} as const;
