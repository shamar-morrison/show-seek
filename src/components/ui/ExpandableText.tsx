import { ACTIVE_OPACITY, COLORS, FONT_SIZE } from '@/constants/theme';
import React, { useCallback, useState } from 'react';
import {
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  TextLayoutEventData,
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
  const [expanded, setExpanded] = useState(false);
  const [shouldTruncate, setShouldTruncate] = useState(false);
  const [measured, setMeasured] = useState(false);

  const onTextLayout = useCallback(
    (e: NativeSyntheticEvent<TextLayoutEventData>) => {
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
  readMoreContainer: {
    marginTop: 4,
  },
  readMore: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
