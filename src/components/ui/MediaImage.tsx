import React, { useState } from 'react';
import { Image, ImageProps } from 'expo-image';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { ImagePlaceholder } from './ImagePlaceholder';

interface MediaImageProps extends Omit<ImageProps, 'source'> {
  source: { uri: string | null | undefined } | string | number | null | undefined;
  width?: number;
  height?: number;
  placeholderStyle?: ViewStyle;
}

/**
 * A wrapper around expo-image's Image component that automatically handles
 * missing or failed images by displaying a custom SVG placeholder.
 */
export const MediaImage: React.FC<MediaImageProps> = ({
  source,
  style,
  width,
  height,
  placeholderStyle,
  ...props
}) => {
  const [hasError, setHasError] = useState(false);
  const [_, setIsLoading] = useState(true);

  // Extract URI from source
  const uri = typeof source === 'object' && source !== null && 'uri' in source
    ? source.uri
    : null;

  // Determine if we should show placeholder
  const shouldShowPlaceholder = !uri || hasError;

  // Extract dimensions from style if not provided as props
  const flattenedStyle = StyleSheet.flatten(style);
  const finalWidth = width || (typeof flattenedStyle?.width === 'number' ? flattenedStyle.width : 100);
  const finalHeight = height || (typeof flattenedStyle?.height === 'number' ? flattenedStyle.height : 150);

  if (shouldShowPlaceholder) {
    return (
      <View style={[style, placeholderStyle]}>
        <ImagePlaceholder width={finalWidth} height={finalHeight} />
      </View>
    );
  }

  return (
    <Image
      {...props}
      source={source}
      style={style}
      onError={() => setHasError(true)}
      onLoadStart={() => setIsLoading(true)}
      onLoadEnd={() => setIsLoading(false)}
      transition={{ duration: 200 }}
    />
  );
};
