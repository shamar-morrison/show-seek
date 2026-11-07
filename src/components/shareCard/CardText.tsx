import React from 'react';
import { Text, TextProps } from 'react-native';

/** Card text must not follow the device font size, or exports would differ per phone. */
export function CardText(props: TextProps) {
  return <Text allowFontScaling={false} {...props} />;
}
