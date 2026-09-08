import { COLORS } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Film01Icon, Tv01Icon, UserIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export type PlaceholderType = 'person' | 'tv' | 'movie';

interface ImagePlaceholderProps {
  type?: PlaceholderType;
}

/**
 * A placeholder for images that fail to load or are missing.
 * Displays an appropriate HugeIcons icon based on the type.
 * Fills its container with a background color and centers the icon.
 */
export const ImagePlaceholder = ({ type = 'movie' }: ImagePlaceholderProps) => {
  const IconComponent = type === 'person' ? UserIcon : type === 'tv' ? Tv01Icon : Film01Icon;

  return (
    <View style={styles.container}>
      <AppIcon
        icon={IconComponent}
        size={48}
        color={COLORS.textSecondary}
        opacity={0.3}
        strokeWidth={1.5}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
