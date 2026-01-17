import { Image, ImageProps } from 'expo-image';
import React, { memo, useState } from 'react';
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
 * Memoized to prevent unnecessary re-renders.
 */
export const MediaImage = memo(
  ({ source, style, placeholderStyle, placeholderType = 'movie', ...props }: MediaImageProps) => {
    const [hasError, setHasError] = useState(false);
    const [_, setIsLoading] = useState(true);

    const uri =
      typeof source === 'object' && source !== null && 'uri' in source ? source.uri : null;

    const shouldShowPlaceholder = !uri || hasError;

    if (shouldShowPlaceholder) {
      return (
        <View style={[style, placeholderStyle, { overflow: 'hidden' }]}>
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
        recyclingKey={uri}
      />
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison focusing on source URI and style
    const prevUri =
      typeof prevProps.source === 'object' && prevProps.source !== null && 'uri' in prevProps.source
        ? prevProps.source.uri
        : prevProps.source;
    const nextUri =
      typeof nextProps.source === 'object' && nextProps.source !== null && 'uri' in nextProps.source
        ? nextProps.source.uri
        : nextProps.source;

    return (
      prevUri === nextUri &&
      prevProps.style === nextProps.style &&
      prevProps.placeholderType === nextProps.placeholderType &&
      prevProps.contentFit === nextProps.contentFit
    );
  }
);

MediaImage.displayName = 'MediaImage';
