import { ACTIVE_OPACITY, COLORS, FONT_SIZE, HIT_SLOP } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

interface ExpandableTextProps {
  text: string;
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
  readMoreStyle?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

export const ExpandableText: React.FC<ExpandableTextProps> = ({
  text,
  numberOfLines = 4,
  style,
  readMoreStyle,
  containerStyle,
}) => {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const [expanded, setExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const [measured, setMeasured] = useState(false);

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

  return (
    <View style={containerStyle}>
      {/* Hidden text for measurement */}
      {!measured && (
        <Text style={[style, styles.hiddenText]} onTextLayout={onTextLayout}>
          {text}
        </Text>
      )}

      <Text style={style} numberOfLines={shouldTruncate && !expanded ? numberOfLines : undefined}>
        {text}
      </Text>

      {shouldTruncate && (
        <TouchableOpacity
          onPress={toggleExpanded}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.readMoreContainer}
          hitSlop={HIT_SLOP.m}
        >
          <Text style={[styles.readMore, { color: accentColor }, readMoreStyle]}>
            {expanded ? t('common.readLess') : t('common.readMore')}
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
  readMoreContainer: {
    marginTop: 4,
  },
  readMore: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
