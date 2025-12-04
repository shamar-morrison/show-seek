import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import * as Haptics from 'expo-haptics';
import { ChevronRight, LucideIcon } from 'lucide-react-native';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface LibraryNavigationCardProps {
  icon: LucideIcon;
  title: string;
  onPress: () => void;
  testID?: string;
}

export const LibraryNavigationCard = memo<LibraryNavigationCardProps>(
  ({ icon: Icon, title, onPress, testID }) => {
    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    };

    return (
      <Pressable
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
        onPress={handlePress}
        testID={testID}
      >
        <Icon size={24} color={COLORS.primary} />
        <Text style={styles.title}>{title}</Text>
        <ChevronRight size={20} color={COLORS.textSecondary} />
      </Pressable>
    );
  }
);

LibraryNavigationCard.displayName = 'LibraryNavigationCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    gap: SPACING.m,
  },
  pressed: {
    opacity: ACTIVE_OPACITY,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
});
