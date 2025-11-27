import { getImageUrl } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { WatchProvidersSectionProps } from './types';

export function WatchProvidersSection({ watchProviders, style }: WatchProvidersSectionProps) {
  if (
    !watchProviders ||
    (!watchProviders.flatrate && !watchProviders.rent && !watchProviders.buy)
  ) {
    return null;
  }

  return (
    <View style={style}>
      <Text style={detailStyles.sectionTitle}>Where to Watch</Text>
      {watchProviders.flatrate && watchProviders.flatrate.length > 0 && (
        <View style={detailStyles.providersSection}>
          <Text style={detailStyles.providerType}>Streaming</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {watchProviders.flatrate.map((provider) => (
              <View key={provider.provider_id} style={detailStyles.providerCard}>
                <MediaImage
                  source={{ uri: getImageUrl(provider.logo_path, '/w92') }}
                  style={detailStyles.providerLogo}
                  contentFit="contain"
                />
                <Text style={detailStyles.providerName} numberOfLines={1}>
                  {provider.provider_name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
