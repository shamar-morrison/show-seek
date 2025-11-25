import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Rect, Path } from 'react-native-svg';
import { COLORS } from '@/src/constants/theme';

interface ImagePlaceholderProps {
  width: number;
  height: number;
}

/**
 * A custom SVG placeholder for images that fail to load or are missing.
 * Displays a film icon on a dark background.
 */
export const ImagePlaceholder: React.FC<ImagePlaceholderProps> = ({ width, height }) => {
  // Calculate icon size based on the smaller dimension (max 60% of smaller side)
  const iconSize = Math.min(width, height) * 0.4;
  const iconX = (width - iconSize) / 2;
  const iconY = (height - iconSize) / 2;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Background */}
        <Rect width={width} height={height} fill={COLORS.surface} />

        {/* Film/Media Icon */}
        <Path
          d={`M ${iconX + iconSize * 0.2} ${iconY + iconSize * 0.1}
              L ${iconX + iconSize * 0.8} ${iconY + iconSize * 0.1}
              C ${iconX + iconSize * 0.85} ${iconY + iconSize * 0.1} ${iconX + iconSize * 0.9} ${iconY + iconSize * 0.15} ${iconX + iconSize * 0.9} ${iconY + iconSize * 0.2}
              L ${iconX + iconSize * 0.9} ${iconY + iconSize * 0.8}
              C ${iconX + iconSize * 0.9} ${iconY + iconSize * 0.85} ${iconX + iconSize * 0.85} ${iconY + iconSize * 0.9} ${iconX + iconSize * 0.8} ${iconY + iconSize * 0.9}
              L ${iconX + iconSize * 0.2} ${iconY + iconSize * 0.9}
              C ${iconX + iconSize * 0.15} ${iconY + iconSize * 0.9} ${iconX + iconSize * 0.1} ${iconY + iconSize * 0.85} ${iconX + iconSize * 0.1} ${iconY + iconSize * 0.8}
              L ${iconX + iconSize * 0.1} ${iconY + iconSize * 0.2}
              C ${iconX + iconSize * 0.1} ${iconY + iconSize * 0.15} ${iconX + iconSize * 0.15} ${iconY + iconSize * 0.1} ${iconX + iconSize * 0.2} ${iconY + iconSize * 0.1}
              Z
              M ${iconX + iconSize * 0.25} ${iconY + iconSize * 0.35}
              L ${iconX + iconSize * 0.75} ${iconY + iconSize * 0.35}
              L ${iconX + iconSize * 0.75} ${iconY + iconSize * 0.65}
              L ${iconX + iconSize * 0.25} ${iconY + iconSize * 0.65}
              Z`}
          fill={COLORS.textSecondary}
          opacity={0.3}
        />

        {/* Film strip holes */}
        <Rect
          x={iconX + iconSize * 0.15}
          y={iconY + iconSize * 0.25}
          width={iconSize * 0.05}
          height={iconSize * 0.1}
          fill={COLORS.surface}
          opacity={0.8}
        />
        <Rect
          x={iconX + iconSize * 0.15}
          y={iconY + iconSize * 0.65}
          width={iconSize * 0.05}
          height={iconSize * 0.1}
          fill={COLORS.surface}
          opacity={0.8}
        />
        <Rect
          x={iconX + iconSize * 0.8}
          y={iconY + iconSize * 0.25}
          width={iconSize * 0.05}
          height={iconSize * 0.1}
          fill={COLORS.surface}
          opacity={0.8}
        />
        <Rect
          x={iconX + iconSize * 0.8}
          y={iconY + iconSize * 0.65}
          width={iconSize * 0.05}
          height={iconSize * 0.1}
          fill={COLORS.surface}
          opacity={0.8}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
  },
});
