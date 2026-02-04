import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import * as Haptics from 'expo-haptics';
import { ChevronRight, LucideIcon } from 'lucide-react-native';
import React, { memo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

interface LibraryNavigationCardProps {
  icon: LucideIcon;
  title: string;
  onPress: () => void;
  testID?: string;
  badge?: React.ReactNode;
  isLocked?: boolean;
}

export const LibraryNavigationCard = memo<LibraryNavigationCardProps>(
  ({ icon: Icon, title, onPress, testID, badge, isLocked }) => {
    const { accentColor } = useAccentColor();
    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    };

    return (
      <Pressable
        style={({ pressed }) => [
          styles.container,
          pressed && styles.pressed,
          isLocked && styles.locked,
        ]}
        onPress={handlePress}
        testID={testID}
      >
        <Icon size={24} color={isLocked ? COLORS.textSecondary : accentColor} />
        <Text style={[styles.title, isLocked && styles.titleLocked]}>{title}</Text>
        {badge}
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
  titleLocked: {
    color: COLORS.textSecondary,
  },
  locked: {
    opacity: 0.6,
  },
});
