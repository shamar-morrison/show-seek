import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import React, { useCallback, useState } from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextLayoutEvent,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

interface BlurredTextProps {
  text: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  readMoreStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** When true, the text will be blurred */
  isBlurred: boolean;
}

/**
 * Text component that can display blurred content with tap-to-reveal functionality.
 * Uses a dark overlay to obscure the text until tapped.
 */
export const BlurredText: React.FC<BlurredTextProps> = ({
  text,
  numberOfLines = 4,
  style,
  readMoreStyle,
  containerStyle,
  isBlurred,
}) => {
  const [revealed, setRevealed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const [measured, setMeasured] = useState(false);

  // Determine if blur should be active
  const shouldBlur = isBlurred && !revealed;

  const onTextLayout = useCallback(
    (e: TextLayoutEvent) => {
      if (measured) return;

      const lines = e.nativeEvent.lines;
      if (lines.length > numberOfLines) {
        setShouldTruncate(true);
      }
      setMeasured(true);
    },
    [measured, numberOfLines]
  );

  const toggleExpanded = () => {
    setExpanded(!expanded);
  };

  const handleReveal = () => {
    if (shouldBlur) {
      setRevealed(true);
    }
  };

  return (
    <View style={containerStyle}>
      {/* Hidden text for measurement */}
      {!measured && (
        <Text style={[style, styles.hiddenText]} onTextLayout={onTextLayout}>
          {text}
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={shouldBlur ? ACTIVE_OPACITY : 1}
        onPress={handleReveal}
        disabled={!shouldBlur}
      >
        <View>
          <Text
            style={style}
            numberOfLines={shouldTruncate && !expanded ? numberOfLines : undefined}
          >
            {text}
          </Text>

          {/* Dark overlay to obscure text */}
          {shouldBlur && (
            <View style={styles.blurOverlay}>
              <View style={styles.hintContainer}>
                <Text style={styles.hintText}>Tap to reveal plot</Text>
              </View>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Read more/less button - only show when not blurred */}
      {shouldTruncate && !shouldBlur && (
        <TouchableOpacity
          onPress={toggleExpanded}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.readMoreContainer}
          hitSlop={HIT_SLOP.m}
        >
          <Text style={[styles.readMore, readMoreStyle]}>
            {expanded ? 'Read less' : 'Read more'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hiddenText: {
    position: 'absolute',
    opacity: 0,
    zIndex: -1,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  hintContainer: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.surfaceLight,
  },
  hintText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  readMoreContainer: {
    marginTop: SPACING.xs,
  },
  readMore: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
