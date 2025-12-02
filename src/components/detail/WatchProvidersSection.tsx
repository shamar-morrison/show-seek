import { COLORS, FONT_SIZE } from '@/constants/theme';
import { getImageUrl } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import React, { memo } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
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

const openJustWatchLink = async (link: string) => {
  try {
    const supported = await Linking.canOpenURL(link);
    if (supported) {
      await Linking.openURL(link);
    } else {
      Alert.alert(
        'Unable to Open Link',
        'The watch provider link cannot be opened on this device.',
        [{ text: 'OK' }]
      );
    }
  } catch (error) {
    console.error('Error opening JustWatch link:', error);
    Alert.alert(
      'Error',
      'An error occurred while trying to open the link. Please try again.',
      [{ text: 'OK' }]
    );
  }
};

interface ProviderCategoryProps {
  label: string;
  providers: WatchProvider[];
  link?: string;
}

const ProviderCategory = ({ label, providers, link }: ProviderCategoryProps) => (
  <View style={detailStyles.providersSection}>
    <Text style={detailStyles.providerType}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {providers.map((provider) => {
        const handlePress = () => {
          if (link) {
            openJustWatchLink(link);
          }
        };

        // If link exists, make it pressable
        if (link) {
          return (
            <Pressable
              key={provider.provider_id}
              style={({ pressed }) => [
                detailStyles.providerCard,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handlePress}
              accessibilityRole="button"
              accessibilityLabel={`Watch on ${provider.provider_name} via JustWatch`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <MediaImage
                source={{ uri: getImageUrl(provider.logo_path, '/w92') }}
                style={detailStyles.providerLogo}
                contentFit="contain"
              />
              <Text style={detailStyles.providerName} numberOfLines={1}>
                {provider.provider_name}
              </Text>
            </Pressable>
          );
        }

        // Fallback: non-interactive view if no link
        return (
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
        );
      })}
    </ScrollView>
  </View>
);

export const WatchProvidersSection = memo<WatchProvidersSectionProps>(
  ({ watchProviders, link, style }) => {
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
          <ProviderCategory label="Streaming" providers={watchProviders!.flatrate} link={link} />
        )}

        {watchProviders!.rent && watchProviders!.rent.length > 0 && (
          <ProviderCategory label="Rent" providers={watchProviders!.rent} link={link} />
        )}

        {watchProviders!.buy && watchProviders!.buy.length > 0 && (
          <ProviderCategory label="Buy" providers={watchProviders!.buy} link={link} />
        )}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check if watch providers data changed
    return (
      prevProps.style === nextProps.style &&
      prevProps.link === nextProps.link &&
      prevProps.watchProviders?.flatrate === nextProps.watchProviders?.flatrate &&
      prevProps.watchProviders?.rent === nextProps.watchProviders?.rent &&
      prevProps.watchProviders?.buy === nextProps.watchProviders?.buy
    );
  }
);

WatchProvidersSection.displayName = 'WatchProvidersSection';
