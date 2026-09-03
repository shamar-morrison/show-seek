import { SPACING } from '@/src/constants/theme';
import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';

interface SectionSeparatorProps {
  style?: ViewStyle;
  testID?: string;
}

export const SectionSeparator: React.FC<SectionSeparatorProps> = ({
  style,
  testID = 'section-separator',
}) => {
  return <View testID={testID} style={[styles.separator, style]} />;
};

const styles = StyleSheet.create({
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: SPACING.l,
    width: '100%',
  },
});
