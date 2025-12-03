import { Image, ImageProps } from 'expo-image';
import React, { useState } from 'react';
import { View, ViewStyle } from 'react-native';
import { ImagePlaceholder, PlaceholderType } from './ImagePlaceholder';

interface MediaImageProps extends Omit<ImageProps, 'source'> {
  source: { uri: string | null | undefined } | string | number | null | undefined;
  placeholderStyle?: ViewStyle;
  placeholderType?: PlaceholderType;
}

/**
 * A wrapper around expo-image's Image component that automatically handles
 * missing or failed images by displaying a placeholder.
 */
export const MediaImage = ({
  source,
  style,
  placeholderStyle,
  placeholderType = 'movie',
  ...props
}: MediaImageProps) => {
  const [hasError, setHasError] = useState(false);
  const [_, setIsLoading] = useState(true);

  const uri = typeof source === 'object' && source !== null && 'uri' in source ? source.uri : null;

  const shouldShowPlaceholder = !uri || hasError;

  if (shouldShowPlaceholder) {
    return (
      <View style={[style, placeholderStyle]}>
        <ImagePlaceholder type={placeholderType} />
      </View>
    );
  }

  // Normalize source to ensure uri is never null (convert null to undefined)
  const imageSource =
    typeof source === 'object' && source !== null && 'uri' in source
      ? { uri: source.uri ?? undefined }
      : source;

  return (
    <Image
      {...props}
      source={imageSource}
      style={style}
      onError={() => setHasError(true)}
      onLoadStart={() => setIsLoading(true)}
      onLoadEnd={() => setIsLoading(false)}
      transition={{ duration: 200 }}
    />
  );
};
