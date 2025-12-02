import { COLORS, FONT_SIZE } from '@/constants/theme';
import { getImageUrl } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import React, { memo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { detailStyles } from './detailStyles';
import type { WatchProvider, WatchProviders, WatchProvidersSectionProps } from './types';

const hasAnyProviders = (providers: WatchProviders | null | undefined): boolean => {
  if (!providers) return false;
  return !!(
    (providers.flatrate && providers.flatrate.length > 0) ||
    (providers.rent && providers.rent.length > 0) ||
    (providers.buy && providers.buy.length > 0)
  );
};

interface ProviderCategoryProps {
  label: string;
  providers: WatchProvider[];
}

const ProviderCategory = ({ label, providers }: ProviderCategoryProps) => (
  <View style={detailStyles.providersSection}>
    <Text style={detailStyles.providerType}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {providers.map((provider) => (
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
);

export const WatchProvidersSection = memo<WatchProvidersSectionProps>(
  ({ watchProviders, style }) => {
    if (!hasAnyProviders(watchProviders)) {
      return null;
    }

    return (
      <View style={style}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Text style={detailStyles.sectionTitle}>Where to Watch</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: FONT_SIZE.xs }}>by JustWatch</Text>
        </View>

        {watchProviders!.flatrate && watchProviders!.flatrate.length > 0 && (
          <ProviderCategory label="Streaming" providers={watchProviders!.flatrate} />
        )}

        {watchProviders!.rent && watchProviders!.rent.length > 0 && (
          <ProviderCategory label="Rent" providers={watchProviders!.rent} />
        )}

        {watchProviders!.buy && watchProviders!.buy.length > 0 && (
          <ProviderCategory label="Buy" providers={watchProviders!.buy} />
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check if watch providers data changed
    return (
      prevProps.style === nextProps.style &&
      prevProps.watchProviders?.flatrate === nextProps.watchProviders?.flatrate &&
      prevProps.watchProviders?.rent === nextProps.watchProviders?.rent &&
      prevProps.watchProviders?.buy === nextProps.watchProviders?.buy
    );
  }
);

WatchProvidersSection.displayName = 'WatchProvidersSection';
