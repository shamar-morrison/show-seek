import { COLORS } from '@/constants/theme';
import { Film, Tv, User } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export type PlaceholderType = 'person' | 'tv' | 'movie';

interface ImagePlaceholderProps {
  type?: PlaceholderType;
}

/**
 * A placeholder for images that fail to load or are missing.
 * Displays an appropriate Lucide icon based on the type.
 * Fills its container with a background color and centers the icon.
 */
export const ImagePlaceholder = ({ type = 'movie' }: ImagePlaceholderProps) => {
  const IconComponent = type === 'person' ? User : type === 'tv' ? Tv : Film;

  return (
    <View style={[styles.container, type === 'person' && { borderRadius: 9999 }]}>
      <IconComponent size={48} color={COLORS.textSecondary} opacity={0.3} strokeWidth={1.5} />
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
