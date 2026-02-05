import { COLORS } from '@/src/constants/theme';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const BASE_STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: COLORS.background },
  headerTintColor: COLORS.text,
  headerTitleStyle: { fontWeight: 'bold' },
  contentStyle: { backgroundColor: COLORS.background },
  headerBackTitle: '',
  // Ensure header respects status bar height on Android
  headerStatusBarHeight: Platform.OS === 'android' ? Constants.statusBarHeight : undefined,
} as const;

export const TAB_STACK_SCREEN_OPTIONS = {
  ...BASE_STACK_SCREEN_OPTIONS,
  freezeOnBlur: true,
  // Hide header by default to prevent flash of route path on dynamic screens
  headerShown: false,
} as const;
