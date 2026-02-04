import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

type Theme = { accentColor: string };

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T
): T {
  const { accentColor } = useAccentColor();
  return useMemo(() => StyleSheet.create(factory({ accentColor })), [accentColor]);
}
